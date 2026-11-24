import { describe, expect, it, vi } from 'vitest'
import {
  getProofOverview,
  isPaymentProofRetentionJobEnabled,
  proofPurgeDueAt,
  isProofEligibleForPurge,
  proofDecisionAt,
  readProofRetentionSettings,
  runPaymentProofRetention,
} from '../server/modules/payments/paymentProofRetention.js'

const now = new Date('2026-08-29T15:00:00.000Z')

function settingsClient(row, { onOtherTable } = {}) {
  return {
    from: (table) => {
      if (table === 'payment_proof_settings') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: row, error: null }),
        }
        return builder
      }
      onOtherTable?.(table)
      throw new Error(`no debería consultar ${table}`)
    },
    storage: {
      from: () => {
        throw new Error('no debería tocar Storage')
      },
    },
  }
}

/**
 * Doble de supabase-js para una corrida completa: política, RPC, papelera y
 * Storage. `rpcs` responde por nombre (valor fijo, función o Error).
 */
function runClient({ settings, trash = [], rpcs = {}, storageError = null } = {}) {
  const calls = { rpcs: [], removes: [], trashFilters: [] }
  const chain = (result) =>
    new Proxy(function () {}, {
      get: (_, prop) =>
        prop === 'then'
          ? (resolve, reject) => Promise.resolve(result).then(resolve, reject)
          : (...args) => {
              calls.trashFilters.push([prop, ...args])
              return chain(result)
            },
    })
  const client = {
    from: (table) => {
      if (table === 'payment_proof_settings') return chain({ data: settings, error: null })
      if (table === 'payment_proof_files') return chain({ data: trash, error: null })
      throw new Error(`no debería consultar ${table}`)
    },
    rpc: async (name, args) => {
      calls.rpcs.push({ name, args })
      const handler = rpcs[name]
      if (handler instanceof Error) return { data: null, error: { message: handler.message } }
      return { data: typeof handler === 'function' ? handler(args) : (handler ?? 0), error: null }
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.removes.push({ bucket, paths })
          return storageError ? { data: null, error: storageError } : { data: [], error: null }
        },
      }),
    },
  }
  return { client, calls }
}

describe('política de retención de comprobantes', () => {
  it('sin configuración, con error o con un valor raro, conserva todo', async () => {
    expect((await readProofRetentionSettings(null)).mode).toBe('keep')
    expect((await readProofRetentionSettings(settingsClient(null))).mode).toBe('keep')
    expect(
      (await readProofRetentionSettings(settingsClient({ retention_mode: 'borrar_ya' }))).mode,
    ).toBe('keep')
    const broken = {
      from: () => {
        throw new Error('red caída')
      },
    }
    expect((await readProofRetentionSettings(broken)).mode).toBe('keep')
  })

  it('lee el modo y los días configurados', async () => {
    const settings = await readProofRetentionSettings(
      settingsClient({ retention_mode: 'after_export', retention_days: 45 }),
    )
    expect(settings).toMatchObject({ mode: 'after_export', days: 45 })
    // Un plazo fuera de rango vuelve al default en vez de borrar antes de tiempo.
    const fuera = await readProofRetentionSettings(
      settingsClient({ retention_mode: 'after_days', retention_days: 0 }),
    )
    expect(fuera.days).toBe(30)
  })

  it('el período de la papelera se lee y, si es raro, vuelve a 30 días', async () => {
    expect(
      (
        await readProofRetentionSettings(
          settingsClient({ retention_mode: 'keep', trash_grace_days: 45 }),
        )
      ).graceDays,
    ).toBe(45)
    for (const raro of [0, -3, 99999, null, 'x']) {
      expect(
        (await readProofRetentionSettings(settingsClient({ trash_grace_days: raro }))).graceDays,
      ).toBe(30)
    }
    expect((await readProofRetentionSettings(null)).graceDays).toBe(30)
  })

  it('en modo keep no mueve nada a la papelera, pero sí atiende lo que ya está en ella', async () => {
    const { client, calls } = runClient({ settings: { retention_mode: 'keep', retention_days: 30 } })
    const result = await runPaymentProofRetention({ client, env: {}, now })
    expect(result).toMatchObject({
      mode: 'keep',
      trashed: { athlete: 0, ticket: 0 },
      purged: { purged: 0, failed: 0 },
    })
    // La retención por política nunca se pide en keep...
    expect(calls.rpcs.map((rpc) => rpc.name)).not.toContain('proof_retention_trash')
    // ...pero los huérfanos se revisan igual (la papelera se alimenta de más cosas).
    expect(calls.rpcs.map((rpc) => rpc.name)).toContain('proof_register_orphans')
  })

  it('el interruptor de entorno apaga el job aunque el panel pida borrar', async () => {
    expect(isPaymentProofRetentionJobEnabled({})).toBe(true)
    expect(
      isPaymentProofRetentionJobEnabled({ PAYMENT_PROOF_RETENTION_JOB_ENABLED: 'false' }),
    ).toBe(false)
    const onOtherTable = vi.fn()
    const client = settingsClient(
      { retention_mode: 'after_days', retention_days: 1 },
      { onOtherTable },
    )
    const result = await runPaymentProofRetention({
      client,
      env: { PAYMENT_PROOF_RETENTION_JOB_ENABLED: 'false' },
    })
    expect(result.disabled).toBe(true)
    expect(onOtherTable).not.toHaveBeenCalled()
  })
})

describe('paymentProofRetention', () => {
  it('ancla en approved_at / rejected_at según status', () => {
    expect(
      proofDecisionAt({
        status: 'aprobado',
        approved_at: '2026-08-28T12:00:00.000Z',
        rejected_at: '2026-08-27T12:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-08-28T12:00:00.000Z')

    expect(
      proofDecisionAt({
        status: 'rechazado',
        approved_at: null,
        rejected_at: '2026-08-24T03:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-08-24T03:00:00.000Z')
  })

  it('en keep nunca purga, y no toca pendientes ni órdenes sin path', () => {
    const aprobada = {
      status: 'aprobado',
      payment_proof_path: 'a/b.jpg',
      approved_at: '2020-01-01T00:00:00.000Z',
      payment_proof_exported_at: '2020-01-02T00:00:00.000Z',
    }
    expect(isProofEligibleForPurge(aprobada, { mode: 'keep', days: 1, now })).toBe(false)
    expect(isProofEligibleForPurge(aprobada, { mode: undefined, days: 1, now })).toBe(false)

    expect(
      isProofEligibleForPurge(
        { ...aprobada, status: 'pendiente' },
        { mode: 'after_days', days: 1, now },
      ),
    ).toBe(false)
    expect(
      isProofEligibleForPurge(
        { ...aprobada, payment_proof_path: null },
        { mode: 'after_days', days: 1, now },
      ),
    ).toBe(false)
  })

  it('after_days purga recién pasados los días desde la decisión', () => {
    const base = {
      status: 'aprobado',
      payment_proof_path: 'order/proof.jpg',
      payment_proof_purged_at: null,
      approved_at: '2026-08-19T00:00:00.000Z',
    }
    // 10 días atrás: con 30 todavía no, con 7 sí.
    expect(isProofEligibleForPurge(base, { mode: 'after_days', days: 30, now })).toBe(false)
    expect(isProofEligibleForPurge(base, { mode: 'after_days', days: 7, now })).toBe(true)
  })

  it('after_export exige que se haya descargado y respeta los días desde la descarga', () => {
    const base = {
      status: 'aprobado',
      payment_proof_path: 'order/proof.jpg',
      payment_proof_purged_at: null,
      approved_at: '2025-01-01T00:00:00.000Z',
      payment_proof_exported_at: null,
    }
    // Vieja pero sin descargar: no se borra.
    expect(isProofEligibleForPurge(base, { mode: 'after_export', days: 1, now })).toBe(false)
    // Descargada hace menos que el plazo: todavía no.
    expect(
      isProofEligibleForPurge(
        { ...base, payment_proof_exported_at: '2026-08-28T20:00:00.000Z' },
        { mode: 'after_export', days: 7, now },
      ),
    ).toBe(false)
    // Descargada hace más que el plazo: sí.
    expect(
      isProofEligibleForPurge(
        { ...base, payment_proof_exported_at: '2026-08-20T00:00:00.000Z' },
        { mode: 'after_export', days: 7, now },
      ),
    ).toBe(true)
  })

  it('no vuelve a purgar si ya tiene purged_at', () => {
    expect(
      isProofEligibleForPurge(
        {
          status: 'rechazado',
          payment_proof_path: 'x/y.jpg',
          payment_proof_purged_at: '2026-08-25T00:00:00.000Z',
          rejected_at: '2026-08-20T00:00:00.000Z',
        },
        { mode: 'after_days', days: 1, now },
      ),
    ).toBe(false)
  })
})

describe('proofPurgeDueAt', () => {
  const base = {
    status: 'aprobado',
    payment_proof_path: 'o/p.jpg',
    payment_proof_purged_at: null,
    approved_at: '2026-08-19T00:00:00.000Z',
    payment_proof_exported_at: '2026-08-25T00:00:00.000Z',
  }

  it('after_days cuenta desde la decisión y after_export desde la descarga', () => {
    expect(proofPurgeDueAt(base, { mode: 'after_days', days: 30 })?.toISOString()).toBe(
      '2026-09-18T00:00:00.000Z',
    )
    expect(proofPurgeDueAt(base, { mode: 'after_export', days: 30 })?.toISOString()).toBe(
      '2026-09-24T00:00:00.000Z',
    )
  })

  it('no hay vencimiento si se conserva, si no se descargó o si ya no hay archivo', () => {
    expect(proofPurgeDueAt(base, { mode: 'keep', days: 30 })).toBeNull()
    expect(
      proofPurgeDueAt({ ...base, payment_proof_exported_at: null }, { mode: 'after_export', days: 30 }),
    ).toBeNull()
    expect(
      proofPurgeDueAt({ ...base, payment_proof_path: null }, { mode: 'after_days', days: 30 }),
    ).toBeNull()
    expect(
      proofPurgeDueAt({ ...base, status: 'pendiente' }, { mode: 'after_days', days: 30 }),
    ).toBeNull()
  })
})

describe('getProofOverview', () => {
  const overview = {
    summary: { onServer: 12, notDownloaded: 5, deleted: 3 },
    forecast: { count: 4, notDownloaded: 2, dueNow: 1, nextDueAt: '2026-08-19T00:00:00.000Z' },
    trash: { count: 6, oldestDeletedAt: '2026-08-01T00:00:00.000Z', graceDays: 30, dueForPurge: 2 },
  }

  it('lo pide a la base en una sola llamada con la política indicada', async () => {
    const { client, calls } = runClient({ rpcs: { payment_proof_overview: overview } })
    const result = await getProofOverview(client, { mode: 'after_days', days: 30 })

    expect(calls.rpcs).toEqual([
      {
        name: 'payment_proof_overview',
        args: { p_mode: 'after_days', p_days: 30, p_window_days: 7 },
      },
    ])
    expect(result.summary).toEqual({ onServer: 12, notDownloaded: 5, downloaded: 7, deleted: 3 })
    expect(result.forecast).toMatchObject({
      mode: 'after_days',
      days: 30,
      windowDays: 7,
      count: 4,
      notDownloaded: 2,
      dueNow: 1,
      nextDueAt: '2026-08-19T00:00:00.000Z',
    })
    expect(result.trash).toEqual({
      count: 6,
      oldestDeletedAt: '2026-08-01T00:00:00.000Z',
      graceDays: 30,
      dueForPurge: 2,
    })
  })

  it('tolera campos ausentes o raros sin inventar avisos', async () => {
    const { client } = runClient({ rpcs: { payment_proof_overview: {} } })
    const result = await getProofOverview(client, { mode: 'keep', days: 30 })
    expect(result.summary).toEqual({ onServer: 0, notDownloaded: 0, downloaded: 0, deleted: 0 })
    expect(result.forecast).toMatchObject({ count: 0, notDownloaded: 0, dueNow: 0, nextDueAt: null })
    expect(result.trash).toMatchObject({ count: 0, dueForPurge: 0, graceDays: 30 })
  })

  it('si la base rechaza la política, el error sale (no se asume un resumen)', async () => {
    const { client } = runClient({ rpcs: { payment_proof_overview: new Error('Modo inválido') } })
    await expect(getProofOverview(client, { mode: 'x', days: 1 })).rejects.toThrow('Modo inválido')
  })
})

describe('runPaymentProofRetention — etapas', () => {
  const policy = { retention_mode: 'after_days', retention_days: 14, trash_grace_days: 10 }

  it('mueve lo vencido a la papelera con la política guardada y registra los huérfanos', async () => {
    const { client, calls } = runClient({
      settings: policy,
      rpcs: {
        proof_retention_trash: { athlete: 3, ticket: 1 },
        proof_register_orphans: 2,
      },
    })
    const result = await runPaymentProofRetention({ client, env: {}, now, limit: 50 })

    expect(calls.rpcs.find((rpc) => rpc.name === 'proof_retention_trash').args).toEqual({
      p_mode: 'after_days',
      p_days: 14,
      p_limit: 50,
    })
    expect(result).toMatchObject({
      mode: 'after_days',
      days: 14,
      graceDays: 10,
      trashed: { athlete: 3, ticket: 1 },
      orphans: { registered: 2 },
    })
  })

  it('purga de Storage sólo lo que pasó la gracia, y lo marca después de borrarlo', async () => {
    const { client, calls } = runClient({
      settings: policy,
      trash: [
        { id: 'f1', bucket: 'athlete-payment-proofs', path: 'o1/a.png' },
        { id: 'f2', bucket: 'ticket-payment-proofs', path: 'o2/b.png' },
      ],
      rpcs: { proof_mark_purged: 2 },
    })
    const result = await runPaymentProofRetention({ client, env: {}, now })

    // El corte es now - graceDays: 10 días antes de la corrida.
    expect(calls.trashFilters).toContainEqual(['lte', 'deleted_at', '2026-08-19T15:00:00.000Z'])
    expect(calls.removes).toEqual([
      { bucket: 'athlete-payment-proofs', paths: ['o1/a.png'] },
      { bucket: 'ticket-payment-proofs', paths: ['o2/b.png'] },
    ])
    expect(calls.rpcs.find((rpc) => rpc.name === 'proof_mark_purged').args).toEqual({
      p_file_ids: ['f1', 'f2'],
    })
    expect(result.purged).toMatchObject({ purged: 2, failed: 0 })
  })

  it('si Storage falla, el archivo no se marca como purgado y queda para reintentar', async () => {
    const { client, calls } = runClient({
      settings: policy,
      trash: [{ id: 'f1', bucket: 'athlete-payment-proofs', path: 'o1/a.png' }],
      storageError: { message: 'timeout' },
    })
    const result = await runPaymentProofRetention({ client, env: {}, now })

    expect(result.purged).toMatchObject({ purged: 0, failed: 1 })
    expect(result.purged.errors[0]).toMatchObject({ bucket: 'athlete-payment-proofs' })
    expect(calls.rpcs.map((rpc) => rpc.name)).not.toContain('proof_mark_purged')
  })

  it('la falla de una etapa no frena a las otras', async () => {
    const { client } = runClient({
      settings: policy,
      trash: [{ id: 'f1', bucket: 'athlete-payment-proofs', path: 'o1/a.png' }],
      rpcs: {
        proof_retention_trash: new Error('la base no responde'),
        proof_mark_purged: 1,
        proof_register_orphans: 4,
      },
    })
    const result = await runPaymentProofRetention({ client, env: {}, now })

    expect(result.trashed.error).toMatch(/la base no responde/)
    expect(result.purged).toMatchObject({ purged: 1 })
    expect(result.orphans).toMatchObject({ registered: 4 })
  })
})
