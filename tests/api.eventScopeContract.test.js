import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { concretePath, listRoutes } from './helpers/expressRoutes.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * CONTRATO DEL ROL POR EVENTO.
 *
 * Recorre TODAS las rutas del API. Para cada una que exige sesión de staff, un
 * organizador tiene que recibir `event_scope_denied`, salvo que la ruta esté en
 * `ORGANIZER_ALLOWED`: una lista corta, revisada una por una, de rutas que o son
 * de la propia cuenta o filtran por los eventos asignados.
 *
 * Es lo que hace que "una ruta nueva nace cerrada" sea un hecho verificable y no
 * una intención: si alguien agrega una ruta y la habilita para el organizador sin
 * pasar por acá, este test falla; si agrega una ruta sin tocar nada, queda cerrada
 * y el test pasa. Sumar una ruta a la lista exige además cubrirla con su test de
 * alcance (ver tests/api.eventScopeRoutes.test.js).
 */
const ORGANIZER_ALLOWED = new Set([
  // Cuenta propia.
  'POST /api/auth/me/password',
  'POST /api/auth/me/email',
  'POST /api/auth/athlete-session',
  // Eventos: cada una filtra o verifica contra los eventos asignados
  // (tests/api.eventScopeEvents.test.js).
  'GET /api/events/',
  'POST /api/events/upsert',
  'POST /api/events/:eventSlug/logo/upload-url',
  'POST /api/events/:eventSlug/hero/upload-url',
  'PATCH /api/events/:eventSlug/logo',
  'GET /api/events/:eventSlug/schedule',
  'POST /api/events/:eventSlug/sessions',
  // Cobros: listado por evento y acciones sobre una orden, que verifican el evento
  // de la orden antes de actuar (tests/api.eventScopePayments.test.js).
  'GET /api/events/:eventSlug/payments',
  'POST /api/tickets/orders/:orderId/approve',
  'POST /api/tickets/orders/:orderId/reject',
  'GET /api/tickets/orders/:orderId/proof-url',
  'GET /api/tickets/orders/:orderId/proof',
  'POST /api/athletes/admin/payment-orders/:orderId/approve',
  'POST /api/athletes/admin/payment-orders/:orderId/reject',
  'GET /api/athletes/admin/payment-orders/:orderId/proof-url',
  'GET /api/athletes/admin/payment-orders/:orderId/proof',
  // Lo que arma un evento (tests/api.eventScopeCatalog.test.js): catálogo de cuentas
  // recortado, matriz de medios solo lectura, precio de SU evento y entradas vendidas.
  'GET /api/payment-profiles/',
  'GET /api/platform-settings/',
  'PATCH /api/pricing/events/:eventSlug/registration-price',
  'DELETE /api/pricing/events/:eventSlug/registration-price/schedule',
  'GET /api/tickets/',
  'PUT /api/tickets/:ticketId/access-override',
  // Equipo de puerta del evento (tests/api.eventScopeTeam.test.js): zonas y cuentas de
  // seguridad. Las que actúan por id de zona o de usuario verifican el evento de ESA zona/cuenta.
  'GET /api/security-zones/',
  'POST /api/security-zones/',
  'PATCH /api/security-zones/:zoneId',
  'DELETE /api/security-zones/:zoneId',
  'POST /api/security-zones/preset',
  'PATCH /api/security-zones/members/:userId',
  'GET /api/auth/security-users',
  'POST /api/auth/security-users',
  'POST /api/auth/security-users/bulk',
  'POST /api/auth/security-users/deactivate-all',
  'PATCH /api/auth/security-users/:userId/status',
  'POST /api/auth/security-users/:userId/access-link',
])

function supabaseDouble() {
  const rows = { data: [], error: null }
  const chain = () => {
    const q = {
      select: () => q,
      order: () => q,
      eq: () => q,
      in: () => q,
      is: () => q,
      or: () => q,
      not: () => q,
      gte: () => q,
      lte: () => q,
      limit: () => q,
      range: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    }
    return q
  }
  return {
    from: vi.fn(chain),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  }
}

async function probe(baseUrl, route, cookie) {
  const response = await fetch(`${baseUrl}${concretePath(route.path)}`, {
    method: route.method,
    headers: authHeaders(cookie),
    body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method) ? '{}' : undefined,
    redirect: 'manual',
  })
  let body = null
  try {
    body = await response.json()
  } catch {
    // sin JSON
  }
  return { status: response.status, code: body?.code ?? null }
}

describe('contrato del rol por evento sobre TODAS las rutas', () => {
  it('toda ruta protegida está cerrada al organizador salvo la lista revisada', async () => {
    const organizer = await buildStaffUser({
      email: 'org-contrato@plu.test',
      eventAccess: [
        { eventId: '11111111-1111-4111-8111-111111111111', eventSlug: 'torneo-a-2026' },
      ],
    })
    const prisma = createPrismaDouble([organizer])
    const app = createApp({ prisma, supabaseAdmin: supabaseDouble() })
    const { routes, unmatched } = listRoutes(app)
    const target = listen(app)

    try {
      // Una capa con rutas cuyo prefijo no se pudo resolver sería un hueco del
      // contrato: se falla en voz alta en lugar de contar menos rutas.
      expect(unmatched).toEqual([])
      expect(routes.length).toBeGreaterThan(100)

      const { cookie } = await loginStaff(target.url, { email: organizer.email })
      const open = []
      let protectedCount = 0

      for (const route of routes) {
        const key = `${route.method} ${route.path}`
        const anonymous = await probe(target.url, route, null)
        // Pública (o con su propio esquema de auth): no es del alcance de staff.
        if (anonymous.status !== 401) continue

        const asOrganizer = await probe(target.url, route, cookie)
        // Con la cookie de staff sigue siendo 401: la ruta usa OTRA autenticación
        // (sesión de atleta, secreto de un webhook, token de una orden). No acepta
        // la sesión de staff, así que no es parte de este contrato.
        if (asOrganizer.status === 401) continue
        protectedCount += 1

        const locked = asOrganizer.status === 403 && asOrganizer.code === 'event_scope_denied'
        if (!locked && !ORGANIZER_ALLOWED.has(key)) open.push(`${key} → ${asOrganizer.status}`)
        if (locked && ORGANIZER_ALLOWED.has(key)) open.push(`${key} está en la lista pero cerrada`)
      }

      expect(protectedCount).toBeGreaterThan(80)
      expect(open).toEqual([])
    } finally {
      await target.close()
    }
  }, 120_000)

  it('el Super Admin no queda bloqueado por el candado en ninguna ruta', async () => {
    const admin = await buildStaffUser({ email: 'admin-contrato@plu.test' })
    const prisma = createPrismaDouble([admin])
    const app = createApp({ prisma, supabaseAdmin: supabaseDouble() })
    const { routes } = listRoutes(app)
    const target = listen(app)

    try {
      const { cookie } = await loginStaff(target.url, { email: admin.email })
      const blocked = []
      for (const route of routes) {
        const anonymous = await probe(target.url, route, null)
        if (anonymous.status !== 401) continue
        const result = await probe(target.url, route, cookie)
        if (result.code === 'event_scope_denied') blocked.push(`${route.method} ${route.path}`)
      }
      expect(blocked).toEqual([])
    } finally {
      await target.close()
    }
  }, 120_000)
})
