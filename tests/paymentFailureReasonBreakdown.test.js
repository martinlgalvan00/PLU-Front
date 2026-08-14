import { describe, expect, it } from 'vitest'
import { createSupabasePaymentRepository } from '../server/modules/payments/supabasePaymentRepository.js'

/**
 * `getFailureReasonBreakdown` no reclasifica nada: solo cuenta lo que
 * `paymentAuditTrail.recordFailure` ya dejó en `metadata.diagnosis` de cada
 * asiento fallido de `operational_event_logs`. Este archivo fija ese
 * agrupamiento y el filtro de fechas, sin levantar Supabase real.
 */

function stubClient(rows) {
  const calls = { gte: null, lte: null }
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    gte: (column, value) => {
      calls.gte = { column, value }
      return chain
    },
    lte: (column, value) => {
      calls.lte = { column, value }
      return chain
    },
    then: (resolve) => resolve({ data: rows, error: null }),
  }
  return { client: { from: () => chain }, calls }
}

const FAILED_ROW = (overrides = {}) => ({
  entity_id: 'order-1',
  created_at: '2026-08-13T00:00:00.000Z',
  metadata: {
    diagnosis: {
      code: 'AMOUNT_MISMATCH',
      title: 'El monto no coincide con la preferencia',
      severity: 'blocker',
    },
  },
  ...overrides,
})

describe('getFailureReasonBreakdown', () => {
  it('agrupa por código de diagnóstico y cuenta cuántas filas arrastra cada uno', async () => {
    const { client } = stubClient([
      FAILED_ROW(),
      FAILED_ROW({ entity_id: 'order-2' }),
      FAILED_ROW({
        entity_id: 'order-3',
        metadata: {
          diagnosis: { code: 'CARD_DECLINED', title: 'Tarjeta rechazada por el banco', severity: 'expected' },
        },
      }),
    ])
    const repository = createSupabasePaymentRepository(client, { organizationId: 'org-1' })

    const reasons = await repository.getFailureReasonBreakdown({})

    expect(reasons).toEqual([
      { code: 'AMOUNT_MISMATCH', title: 'El monto no coincide con la preferencia', severity: 'blocker', count: 2, sampleOrderId: 'order-1', lastSeenAt: '2026-08-13T00:00:00.000Z' },
      { code: 'CARD_DECLINED', title: 'Tarjeta rechazada por el banco', severity: 'expected', count: 1, sampleOrderId: 'order-3', lastSeenAt: '2026-08-13T00:00:00.000Z' },
    ])
  })

  it('ordena de mayor a menor frecuencia', async () => {
    const { client } = stubClient([
      FAILED_ROW({
        entity_id: 'order-1',
        metadata: { diagnosis: { code: 'RARE', title: 'Motivo raro', severity: 'expected' } },
      }),
      FAILED_ROW({ entity_id: 'order-2' }),
      FAILED_ROW({ entity_id: 'order-3' }),
    ])
    const repository = createSupabasePaymentRepository(client, { organizationId: 'org-1' })

    const reasons = await repository.getFailureReasonBreakdown({})

    expect(reasons.map((reason) => reason.code)).toEqual(['AMOUNT_MISMATCH', 'RARE'])
    expect(reasons[0].count).toBe(2)
  })

  it('cae a "sin clasificar" cuando la fila no tiene diagnóstico guardado', async () => {
    const { client } = stubClient([FAILED_ROW({ metadata: {} })])
    const repository = createSupabasePaymentRepository(client, { organizationId: 'org-1' })

    const reasons = await repository.getFailureReasonBreakdown({})

    expect(reasons).toEqual([
      {
        code: 'UNCLASSIFIED_PAYMENT_FAILURE',
        title: 'Falla sin clasificar',
        severity: 'unexpected',
        count: 1,
        sampleOrderId: 'order-1',
        lastSeenAt: '2026-08-13T00:00:00.000Z',
      },
    ])
  })

  it('pasa el rango de fechas a la consulta', async () => {
    const { client, calls } = stubClient([])
    const repository = createSupabasePaymentRepository(client, { organizationId: 'org-1' })

    await repository.getFailureReasonBreakdown({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-14T00:00:00.000Z',
    })

    expect(calls.gte).toEqual({ column: 'created_at', value: '2026-08-01T00:00:00.000Z' })
    expect(calls.lte).toEqual({ column: 'created_at', value: '2026-08-14T00:00:00.000Z' })
  })

  it('sin filas devuelve una lista vacía', async () => {
    const { client } = stubClient([])
    const repository = createSupabasePaymentRepository(client, { organizationId: 'org-1' })

    expect(await repository.getFailureReasonBreakdown({})).toEqual([])
  })
})
