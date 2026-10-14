import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Asignar eventos a un organizador. Lo hacen Super Admin y Administrador; el
 * organizador nunca. Los cambios valen al instante, sin cerrarle la sesión.
 */
const A = { id: '11111111-1111-4111-8111-111111111111', slug: 'torneo-a-2026' }
const B = { id: '22222222-2222-4222-8222-222222222222', slug: 'torneo-b-2026' }
const GHOST = '99999999-9999-4999-8999-999999999999'

function createSupabase() {
  const events = [
    { id: A.id, slug: A.slug, title: 'Torneo A', ends_at: null },
    { id: B.id, slug: B.slug, title: 'Torneo B', ends_at: null },
  ]
  const from = vi.fn((table) => {
    let rows = table === 'events' ? [...events] : []
    const query = {
      select: () => query,
      in: (column, values) => ((rows = rows.filter((row) => values.includes(row[column]))), query),
      eq: (column, value) => ((rows = rows.filter((row) => String(row[column]) === String(value))), query),
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return query
  })
  return { client: { from, rpc: vi.fn(async () => ({ data: [], error: null })) }, events }
}

async function setup() {
  const admin = await buildStaffUser({ email: 'admin-asigna@plu.test' })
  const organizer = await buildStaffUser({ email: 'organizador-asigna@plu.test', eventAccess: [] })
  const plain = await buildStaffUser({ role: 'operador_plu_arg', email: 'operador@plu.test' })
  const users = [admin, organizer, plain]
  const supabase = createSupabase()
  const target = listen(
    createApp({ prisma: createPrismaDouble(users), supabaseAdmin: supabase.client }),
  )
  const adminCookie = (await loginStaff(target.url, { email: admin.email })).cookie
  const orgCookie = (await loginStaff(target.url, { email: organizer.email })).cookie
  return { target, adminCookie, orgCookie, users, organizer, plain, supabase }
}

async function call(ctx, cookie, method, path, body) {
  const response = await fetch(`${ctx.target.url}${path}`, {
    method,
    headers: authHeaders(cookie),
    body: body && !['GET', 'HEAD'].includes(method) ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    // sin cuerpo JSON
  }
  return { status: response.status, body: json }
}

describe('asignar eventos a un organizador', () => {
  it('el cambio vale al instante, sin que el organizador vuelva a iniciar sesión', async () => {
    const ctx = await setup()
    try {
      // Sin eventos asignados no ve ninguno (no cae en acceso global).
      const sin = await call(ctx, ctx.orgCookie, 'GET', '/api/events')
      expect(sin.status).toBe(200)
      expect(sin.body.events).toEqual([])

      const asigna = await call(ctx, ctx.adminCookie, 'PUT', `/api/users/${ctx.organizer.id}/event-access`, {
        eventIds: [A.id],
      })
      expect(asigna.status, JSON.stringify(asigna.body)).toBe(200)
      expect(asigna.body.eventAccess).toEqual([
        expect.objectContaining({ eventId: A.id, eventSlug: A.slug }),
      ])

      // MISMA cookie del organizador: la caché se purgó y relee la lista.
      const con = await call(ctx, ctx.orgCookie, 'GET', '/api/events')
      expect(con.body.events.map((event) => event.slug)).toEqual([A.slug])

      // Quitarlo corta el acceso también al instante.
      await call(ctx, ctx.adminCookie, 'PUT', `/api/users/${ctx.organizer.id}/event-access`, {
        eventIds: [],
      })
      const quitado = await call(ctx, ctx.orgCookie, 'GET', '/api/events')
      expect(quitado.body.events).toEqual([])
    } finally {
      await ctx.target.close()
    }
  })

  it('reemplaza el conjunto: agrega los nuevos y quita los que no vienen', async () => {
    const ctx = await setup()
    try {
      const path = `/api/users/${ctx.organizer.id}/event-access`
      await call(ctx, ctx.adminCookie, 'PUT', path, { eventIds: [A.id, B.id] })
      const dos = await call(ctx, ctx.adminCookie, 'GET', path)
      expect(dos.body.eventAccess.map((row) => row.eventSlug).sort()).toEqual([A.slug, B.slug])

      await call(ctx, ctx.adminCookie, 'PUT', path, { eventIds: [B.id, B.id] })
      const uno = await call(ctx, ctx.adminCookie, 'GET', path)
      expect(uno.body.eventAccess.map((row) => row.eventSlug)).toEqual([B.slug])
    } finally {
      await ctx.target.close()
    }
  })

  it('un evento que no existe se rechaza sin asignar nada', async () => {
    const ctx = await setup()
    try {
      const result = await call(
        ctx,
        ctx.adminCookie,
        'PUT',
        `/api/users/${ctx.organizer.id}/event-access`,
        { eventIds: [A.id, GHOST] },
      )
      expect(result.status).toBe(400)
      expect(result.body.code).toBe('EVENT_NOT_FOUND')
      expect(ctx.organizer.eventAccess).toEqual([])
    } finally {
      await ctx.target.close()
    }
  })

  it('solo las cuentas con rol Organizador tienen eventos asignados', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, ctx.adminCookie, 'PUT', `/api/users/${ctx.plain.id}/event-access`, {
        eventIds: [A.id],
      })
      expect(result.status).toBe(400)
      expect(
        (await call(ctx, ctx.adminCookie, 'PUT', '/api/users/inexistente/event-access', { eventIds: [] }))
          .status,
      ).toBe(404)
    } finally {
      await ctx.target.close()
    }
  })

  it('el organizador no puede asignarse eventos a sí mismo ni a otros', async () => {
    const ctx = await setup()
    try {
      const propio = await call(
        ctx,
        ctx.orgCookie,
        'PUT',
        `/api/users/${ctx.organizer.id}/event-access`,
        { eventIds: [A.id, B.id] },
      )
      expect(propio.status).toBe(403)
      expect(propio.body.code).toBe('event_scope_denied')
      expect(ctx.organizer.eventAccess).toEqual([])
    } finally {
      await ctx.target.close()
    }
  })

  it('el listado de usuarios trae los eventos de cada organizador', async () => {
    const ctx = await setup()
    try {
      await call(ctx, ctx.adminCookie, 'PUT', `/api/users/${ctx.organizer.id}/event-access`, {
        eventIds: [A.id],
      })
      const list = await call(ctx, ctx.adminCookie, 'GET', '/api/users')
      const organizer = list.body.users.find((user) => user.id === ctx.organizer.id)
      expect(organizer.eventScoped).toBe(true)
      expect(organizer.eventAccess).toEqual([{ eventId: A.id, eventSlug: A.slug }])
      const plain = list.body.users.find((user) => user.id === ctx.plain.id)
      expect(plain.eventScoped).toBe(false)
      expect(plain.eventAccess).toBeUndefined()
    } finally {
      await ctx.target.close()
    }
  })
})
