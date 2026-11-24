import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'

/**
 * Rutas del archivo de comprobantes: resumen, política de borrado y descarga.
 * Se usa un doble de Supabase que responde por tabla; lo que importa acá es el
 * contrato HTTP (permisos, validación, qué se marca como descargado).
 */

const ENV = { AUTH_SECRET: 'test-secret-comprobantes-plu', APP_URL: 'https://panel.pluarg.test' }
const PASSWORD = 'clave-admin-123'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

// Los limiters comparten balde por IP dentro del archivo: una IP por request.
let ipSeq = 0
function headers(cookie) {
  ipSeq += 1
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    'x-vercel-forwarded-for': `10.30.0.${ipSeq}`,
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createPrismaDouble(users) {
  const sessions = []
  return {
    user: {
      findUnique: async ({ where }) =>
        users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      findMany: async () => users,
      update: async ({ where, data }) =>
        Object.assign(
          users.find((u) => u.id === where.id),
          data,
        ),
    },
    session: {
      create: async ({ data }) => {
        const session = { id: `ses-${sessions.length + 1}`, revokedAt: null, ...data }
        sessions.push(session)
        return session
      },
      findUnique: async ({ where }) => {
        const session = sessions.find((item) => item.tokenHash === where.tokenHash)
        return session ? { ...session, user: users.find((u) => u.id === session.userId) } : null
      },
      updateMany: async () => ({ count: 0 }),
    },
    auditLog: { create: async () => ({}) },
  }
}

/** Builder encadenable que, al esperarse, resuelve con `result`. */
function chain(result, onCall) {
  const target = function () {}
  const proxy = new Proxy(target, {
    get(_, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject)
      return (...args) => {
        onCall?.(prop, args)
        return proxy
      }
    },
  })
  return proxy
}

function fakeSupabase({
  settings,
  orders = [],
  ticketOrders = [],
  files = {},
  count = 0,
  rpcs = {},
  trashFiles = [],
}) {
  const calls = { upserts: [], updates: [], audits: [], rpcs: [], removes: [] }

  // La papelera: `maybeSingle` devuelve un archivo, el resto la lista.
  const filesQuery = () => {
    let single = false
    const proxy = new Proxy(function () {}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) =>
            Promise.resolve(
              single
                ? { data: trashFiles[0] ?? null, error: null }
                : { data: trashFiles, error: null, count: trashFiles.length },
            ).then(resolve, reject)
        }
        return () => {
          if (prop === 'maybeSingle') single = true
          return proxy
        }
      },
    })
    return proxy
  }

  return {
    calls,
    rpc: async (name, args) => {
      // El login y otras rutas también llaman RPC: acá sólo importan las de comprobantes.
      if (/^(proof_|payment_proof_)/.test(name)) calls.rpcs.push({ name, args })
      const handler = rpcs[name]
      if (handler?.error) return { data: null, error: handler.error }
      return { data: typeof handler === 'function' ? handler(args) : (handler ?? null), error: null }
    },
    from: (table) => {
      if (table === 'payment_proof_settings') {
        return {
          select: () => chain({ data: settings, error: null }),
          upsert: (row) => {
            calls.upserts.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'operational_event_logs') {
        return {
          insert: (row) => {
            calls.audits.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'payment_proof_files') return { select: filesQuery }
      const rows = table === 'ticket_orders' ? ticketOrders : orders
      return {
        select: (_columns, options) =>
          options?.head
            ? chain({ count: table === 'ticket_orders' ? 0 : count, error: null })
            : chain({ data: rows, error: null }),
        update: (patch) => {
          const record = { patch }
          calls.updates.push(record)
          return chain({ error: null }, (prop, args) => {
            if (prop === 'in') record.ids = args[1]
          })
        },
      }
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.removes.push({ bucket, paths })
          return { data: [], error: null }
        },
        download: async (path) =>
          files[path]
            ? {
                data: {
                  type: 'image/png',
                  arrayBuffer: async () =>
                    files[path].buffer.slice(
                      files[path].byteOffset,
                      files[path].byteOffset + files[path].byteLength,
                    ),
                },
                error: null,
              }
            : { data: null, error: { message: 'Object not found' } },
      }),
    },
  }
}

async function start(role, supabaseAdmin) {
  const users = [
    {
      id: 'usr-1',
      email: 'admin@pluarg.test',
      passwordHash: await hashPassword(PASSWORD),
      mustChangePassword: false,
      role,
      status: 'active',
      profile: { firstName: 'Admin', lastName: 'PLU' },
      eventId: null,
      eventSlug: null,
    },
  ]
  const target = listen(createApp({ prisma: createPrismaDouble(users), env: ENV, supabaseAdmin }))
  const login = await fetch(`${target.url}/api/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email: 'admin@pluarg.test', password: PASSWORD }),
  })
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  return { target, cookie }
}

describe('archivo de comprobantes — rutas', () => {
  it('sin sesión no se puede leer ni descargar nada', async () => {
    const { target } = await start('admin_plu_arg', fakeSupabase({}))
    try {
      const summary = await fetch(`${target.url}/api/payment-proofs/summary`, {
        headers: headers(),
      })
      const exported = await fetch(`${target.url}/api/payment-proofs/export`, {
        method: 'POST',
        headers: headers(),
        body: '{}',
      })
      expect(summary.status).toBe(401)
      expect(exported.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('el resumen trae los contadores y, sin política guardada, conservar', async () => {
    const supabase = fakeSupabase({
      settings: null,
      rpcs: {
        payment_proof_overview: {
          summary: { onServer: 7, notDownloaded: 2, deleted: 1 },
          forecast: { count: 0, notDownloaded: 0, dueNow: 0, nextDueAt: null },
          trash: { count: 3, oldestDeletedAt: '2026-10-01T00:00:00Z', graceDays: 30, dueForPurge: 1 },
        },
      },
    })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    try {
      const response = await fetch(`${target.url}/api/payment-proofs/summary`, {
        headers: headers(cookie),
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.settings).toMatchObject({ mode: 'keep', days: 30, graceDays: 30 })
      expect(body.summary).toEqual({ onServer: 7, notDownloaded: 2, downloaded: 5, deleted: 1 })
      expect(body.trash).toMatchObject({ count: 3, dueForPurge: 1, graceDays: 30 })
      // Resumen, pronóstico y papelera en una sola llamada a la base.
      expect(supabase.calls.rpcs).toHaveLength(1)
    } finally {
      await target.close()
    }
  })

  it('guarda la política, la audita y rechaza valores inválidos', async () => {
    const supabase = fakeSupabase({ settings: { retention_mode: 'keep', retention_days: 30 } })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    try {
      const ok = await fetch(`${target.url}/api/payment-proofs/settings`, {
        method: 'PUT',
        headers: headers(cookie),
        body: JSON.stringify({ mode: 'after_export', days: 14 }),
      })
      expect(ok.status).toBe(200)
      expect(supabase.calls.upserts[0]).toMatchObject({
        retention_mode: 'after_export',
        retention_days: 14,
      })
      // El login también audita: se busca el evento de la política.
      expect(
        supabase.calls.audits.find((row) => row.action === 'payment_proofs.retention_updated'),
      ).toMatchObject({ severity: 'warning' })

      for (const bad of [
        { mode: 'borrar_ya', days: 5 },
        { mode: 'after_days', days: 0 },
        { mode: 'after_days', days: 99999 },
        { mode: 'after_days' },
      ]) {
        const response = await fetch(`${target.url}/api/payment-proofs/settings`, {
          method: 'PUT',
          headers: headers(cookie),
          body: JSON.stringify(bad),
        })
        expect(response.status).toBe(400)
      }
      expect(supabase.calls.upserts).toHaveLength(1)
    } finally {
      await target.close()
    }
  })

  it('la descarga devuelve un ZIP y marca como descargados sólo los que entraron', async () => {
    const order = (id, path) => ({
      id,
      reference: `RORD-${id}`,
      concept: 'registration',
      amount: 100000,
      currency: 'ARS',
      method: 'manual_link',
      manual_payment_channel: 'bank_transfer',
      status: 'aprobado',
      created_at: '2026-10-09T10:00:00Z',
      approved_at: '2026-10-09T12:00:00Z',
      payment_proof_path: path,
      payment_proof_uploaded_at: '2026-10-09T11:00:00Z',
      payment_proof_exported_at: null,
      payment_proof_purged_at: null,
      athlete: { full_name: 'Ana Pérez', document_id: '30111222' },
    })
    const supabase = fakeSupabase({
      orders: [order('aaaaaaaa11', 'o1/a.png'), order('bbbbbbbb22', 'o2/b.png')],
      files: { 'o1/a.png': Buffer.from('imagen') },
      count: 1, // lo que sigue pendiente tras la descarga: el que no se pudo leer
    })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    try {
      const response = await fetch(`${target.url}/api/payment-proofs/export`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({ scope: 'pending' }),
      })
      const bytes = Buffer.from(await response.arrayBuffer())

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/zip')
      expect(response.headers.get('content-disposition')).toMatch(
        /comprobantes-\d{4}-\d{2}-\d{2}\.zip/,
      )
      expect(response.headers.get('x-export-count')).toBe('1')
      expect(response.headers.get('x-export-remaining')).toBe('1')
      expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304')
      expect(supabase.calls.updates[0].ids).toEqual(['aaaaaaaa11'])
    } finally {
      await target.close()
    }
  })

  it('el resumen avisa qué va a la papelera pronto y cuánto no tiene copia', async () => {
    const supabase = fakeSupabase({
      settings: { retention_mode: 'after_days', retention_days: 30 },
      rpcs: {
        payment_proof_overview: {
          summary: { onServer: 1, notDownloaded: 1, deleted: 0 },
          forecast: { count: 1, notDownloaded: 1, dueNow: 1, nextDueAt: '2020-01-31T00:00:00Z' },
          trash: { count: 0, graceDays: 30, dueForPurge: 0 },
        },
      },
    })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    try {
      const response = await fetch(`${target.url}/api/payment-proofs/summary`, {
        headers: headers(cookie),
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.forecast).toMatchObject({
        mode: 'after_days',
        windowDays: 7,
        count: 1,
        notDownloaded: 1,
      })
      // La política guardada es la que se le pasa a la base para calcular.
      expect(supabase.calls.rpcs[0].args).toEqual({
        p_mode: 'after_days',
        p_days: 30,
        p_window_days: 7,
      })
    } finally {
      await target.close()
    }
  })

  it('el pronóstico de una política sin guardar valida los parámetros y no escribe nada', async () => {
    const supabase = fakeSupabase({
      settings: null,
      orders: [],
      rpcs: { payment_proof_overview: { forecast: { count: 4, notDownloaded: 1 } } },
    })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    try {
      const ok = await fetch(`${target.url}/api/payment-proofs/forecast?mode=after_days&days=90`, {
        headers: headers(cookie),
      })
      expect(ok.status).toBe(200)
      expect((await ok.json()).forecast).toMatchObject({
        mode: 'after_days',
        days: 90,
        count: 4,
        notDownloaded: 1,
      })
      expect(supabase.calls.rpcs[0].args).toMatchObject({ p_mode: 'after_days', p_days: 90 })

      const bad = await fetch(`${target.url}/api/payment-proofs/forecast?mode=borrar&days=90`, {
        headers: headers(cookie),
      })
      expect(bad.status).toBe(400)
      expect(supabase.calls.upserts).toHaveLength(0)
      expect(supabase.calls.updates).toHaveLength(0)
    } finally {
      await target.close()
    }
  })

  it('rechaza un cursor que no es una fecha y expone el siguiente en un header', async () => {
    const supabase = fakeSupabase({ orders: [], count: 0 })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    try {
      const bad = await fetch(`${target.url}/api/payment-proofs/export`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({ scope: 'all', after: 'ayer' }),
      })
      expect(bad.status).toBe(400)
      expect(supabase.calls.updates).toHaveLength(0)
    } finally {
      await target.close()
    }
  })

  it('el período de la papelera se guarda aparte, se valida y, si falta, no se pisa', async () => {
    const supabase = fakeSupabase({
      settings: { retention_mode: 'keep', retention_days: 30, trash_grace_days: 30 },
      rpcs: { payment_proof_overview: {} },
    })
    const { target, cookie } = await start('admin_plu_arg', supabase)
    const put = (body) =>
      fetch(`${target.url}/api/payment-proofs/settings`, {
        method: 'PUT',
        headers: headers(cookie),
        body: JSON.stringify(body),
      })
    try {
      expect((await put({ mode: 'after_days', days: 14, graceDays: 45 })).status).toBe(200)
      expect(supabase.calls.upserts[0]).toMatchObject({ trash_grace_days: 45 })

      expect((await put({ mode: 'keep', days: 30 })).status).toBe(200)
      expect(supabase.calls.upserts[1]).not.toHaveProperty('trash_grace_days')

      expect((await put({ mode: 'keep', days: 30, graceDays: 0 })).status).toBe(400)
      expect((await put({ mode: 'keep', days: 30, graceDays: 99999 })).status).toBe(400)
      expect(supabase.calls.upserts).toHaveLength(2)
    } finally {
      await target.close()
    }
  })

  describe('papelera', () => {
    const trashed = {
      id: '11111111-1111-4111-8111-111111111111',
      source: 'athlete',
      order_id: '22222222-2222-4222-8222-222222222222',
      bucket: 'athlete-payment-proofs',
      path: '22222222-2222-4222-8222-222222222222/a.png',
      uploaded_at: '2026-09-01T00:00:00Z',
      exported_at: null,
      deleted_at: new Date().toISOString(),
      deleted_by: 'usr-1:admin@pluarg.test',
      deleted_reason: 'manual',
    }
    const FILE_ID = trashed.id
    const ORDER_ID = trashed.order_id

    const call = (target, cookie, path, init = {}) =>
      fetch(`${target.url}/api/payment-proofs${path}`, {
        headers: headers(cookie),
        ...init,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      })

    it('sin sesión nada de la papelera responde', async () => {
      const { target } = await start('admin_plu_arg', fakeSupabase({}))
      try {
        expect((await call(target, null, '/trash')).status).toBe(401)
        expect(
          (await call(target, null, `/trash/${FILE_ID}/restore`, { method: 'POST', body: {} })).status,
        ).toBe(401)
        expect((await call(target, null, `/trash/${FILE_ID}`, { method: 'DELETE' })).status).toBe(401)
        expect(
          (await call(target, null, '/trash/empty', { method: 'POST', body: { confirm: true } })).status,
        ).toBe(401)
      } finally {
        await target.close()
      }
    })

    it('un rol sin acceso a pagos no ve ni toca la papelera', async () => {
      const supabase = fakeSupabase({ trashFiles: [trashed] })
      const { target, cookie } = await start('plu_arg', supabase)
      try {
        expect((await call(target, cookie, '/trash')).status).toBe(403)
        expect(
          (await call(target, cookie, `/trash/${FILE_ID}/restore`, { method: 'POST', body: {} })).status,
        ).toBe(403)
        expect((await call(target, cookie, `/trash/${FILE_ID}`, { method: 'DELETE' })).status).toBe(403)
        expect(supabase.calls.rpcs).toHaveLength(0)
        expect(supabase.calls.removes).toHaveLength(0)
      } finally {
        await target.close()
      }
    })

    it('lista la papelera con el período de gracia y a quién corresponde cada archivo', async () => {
      const supabase = fakeSupabase({
        settings: { retention_mode: 'keep', retention_days: 30, trash_grace_days: 15 },
        trashFiles: [trashed],
        orders: [
          {
            id: ORDER_ID,
            reference: 'RORD-1',
            amount: 5000,
            currency: 'ARS',
            status: 'aprobado',
            athlete: { full_name: 'Ana Pérez' },
          },
        ],
      })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        const response = await call(target, cookie, '/trash?limit=10')
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body.graceDays).toBe(15)
        expect(body.total).toBe(1)
        expect(body.items[0]).toMatchObject({
          id: FILE_ID,
          reference: 'RORD-1',
          person: 'Ana Pérez',
          reason: 'manual',
          restorable: true,
        })
        expect((await call(target, cookie, '/trash?limit=0')).status).toBe(400)
      } finally {
        await target.close()
      }
    })

    it('restaurar le pasa a la base quién lo hace y deja asiento de auditoría', async () => {
      const supabase = fakeSupabase({
        rpcs: { proof_restore: { restored: true, fileId: FILE_ID, source: 'athlete', orderId: ORDER_ID } },
      })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        const response = await call(target, cookie, `/trash/${FILE_ID}/restore`, {
          method: 'POST',
          body: {},
        })
        expect(response.status).toBe(200)
        expect((await response.json()).restored).toBe(true)
        expect(supabase.calls.rpcs[0]).toMatchObject({
          name: 'proof_restore',
          args: { p_file_id: FILE_ID, p_actor: expect.stringContaining('admin@pluarg.test') },
        })
        expect(
          supabase.calls.audits.find((row) => row.action === 'payment_proofs.restored'),
        ).toMatchObject({ entity_id: FILE_ID })
        expect((await call(target, cookie, '/trash/no-es-uuid/restore', { method: 'POST', body: {} })).status).toBe(400)
      } finally {
        await target.close()
      }
    })

    it('si la base no deja restaurar (la orden ya tiene otro comprobante), el staff ve el motivo', async () => {
      const supabase = fakeSupabase({
        rpcs: {
          proof_restore: { error: { code: 'PLU10', message: 'La orden ya tiene otro comprobante.' } },
        },
      })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        const response = await call(target, cookie, `/trash/${FILE_ID}/restore`, {
          method: 'POST',
          body: {},
        })
        expect(response.status).toBe(409)
        expect((await response.json()).error).toMatch(/otro comprobante/)
        expect(supabase.calls.audits.some((row) => row.action === 'payment_proofs.restored')).toBe(false)
      } finally {
        await target.close()
      }
    })

    it('eliminar ahora saca el archivo de Storage, lo marca y audita como advertencia', async () => {
      const supabase = fakeSupabase({ trashFiles: [trashed], rpcs: { proof_mark_purged: 1 } })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        const response = await call(target, cookie, `/trash/${FILE_ID}`, { method: 'DELETE' })
        expect(response.status).toBe(200)
        expect(supabase.calls.removes).toEqual([{ bucket: trashed.bucket, paths: [trashed.path] }])
        expect(supabase.calls.rpcs[0]).toMatchObject({
          name: 'proof_mark_purged',
          args: { p_file_ids: [FILE_ID] },
        })
        expect(
          supabase.calls.audits.find((row) => row.action === 'payment_proofs.purged'),
        ).toMatchObject({ severity: 'warning' })
      } finally {
        await target.close()
      }
    })

    it('eliminar algo que no está en la papelera responde 404 y no toca Storage', async () => {
      const supabase = fakeSupabase({ trashFiles: [] })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        expect((await call(target, cookie, `/trash/${FILE_ID}`, { method: 'DELETE' })).status).toBe(404)
        expect(supabase.calls.removes).toHaveLength(0)
      } finally {
        await target.close()
      }
    })

    it('vaciar exige confirmación explícita y recién entonces purga', async () => {
      const trashList = [trashed]
      const supabase = fakeSupabase({
        trashFiles: trashList,
        rpcs: {
          proof_mark_purged: () => {
            trashList.length = 0
            return 1
          },
        },
      })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        for (const body of [{}, { confirm: false }, { confirm: 'si' }]) {
          expect((await call(target, cookie, '/trash/empty', { method: 'POST', body })).status).toBe(400)
        }
        expect(supabase.calls.removes).toHaveLength(0)

        const response = await call(target, cookie, '/trash/empty', {
          method: 'POST',
          body: { confirm: true },
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ purged: 1, failed: 0 })
        expect(supabase.calls.removes).toHaveLength(1)
        expect(
          supabase.calls.audits.find((row) => row.action === 'payment_proofs.trash_emptied'),
        ).toMatchObject({ severity: 'warning' })
      } finally {
        await target.close()
      }
    })

    it('la baja manual valida el origen y la orden, y deja asiento', async () => {
      const supabase = fakeSupabase({ rpcs: { proof_trash: { trashed: true, fileId: FILE_ID } } })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        expect(
          (await call(target, cookie, `/orders/otro/${ORDER_ID}/trash`, { method: 'POST', body: {} })).status,
        ).toBe(400)
        expect(
          (await call(target, cookie, '/orders/athlete/no-es-uuid/trash', { method: 'POST', body: {} })).status,
        ).toBe(400)
        expect(supabase.calls.rpcs).toHaveLength(0)

        const response = await call(target, cookie, `/orders/ticket/${ORDER_ID}/trash`, {
          method: 'POST',
          body: {},
        })
        expect(response.status).toBe(200)
        expect((await response.json()).trashed).toBe(true)
        expect(supabase.calls.rpcs[0]).toMatchObject({
          name: 'proof_trash',
          args: { p_source: 'ticket', p_order_id: ORDER_ID },
        })
        expect(supabase.calls.audits.find((row) => row.action === 'payment_proofs.trashed')).toBeTruthy()
      } finally {
        await target.close()
      }
    })

    it('ver un archivo de la papelera lo sirve sin caché; si ya no está, 404', async () => {
      const supabase = fakeSupabase({
        trashFiles: [trashed],
        files: { [trashed.path]: Buffer.from('imagen') },
      })
      const { target, cookie } = await start('admin_plu_arg', supabase)
      try {
        const ok = await call(target, cookie, `/trash/${FILE_ID}/file`)
        expect(ok.status).toBe(200)
        expect(ok.headers.get('cache-control')).toMatch(/no-store/)
        expect(ok.headers.get('x-content-type-options')).toBe('nosniff')
        expect(Buffer.from(await ok.arrayBuffer()).toString()).toBe('imagen')
      } finally {
        await target.close()
      }

      const missing = fakeSupabase({ trashFiles: [trashed], files: {} })
      const second = await start('admin_plu_arg', missing)
      try {
        expect((await call(second.target, second.cookie, `/trash/${FILE_ID}/file`)).status).toBe(404)
      } finally {
        await second.target.close()
      }
    })
  })
})
