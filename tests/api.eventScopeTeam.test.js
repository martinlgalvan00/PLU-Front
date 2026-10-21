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
 * Equipo de puerta de un evento: un organizador crea y asigna cuentas de seguridad
 * SOLO dentro de sus eventos. Las rutas de zonas y de cuentas actúan por id de zona
 * o de usuario, así que se prueba también que no puedan usarse para tocar a otros.
 */
const A = { id: '11111111-1111-4111-8111-111111111111', slug: 'torneo-a-2026' }
const B = { id: '22222222-2222-4222-8222-222222222222', slug: 'torneo-b-2026' }
const FUTURE = '2099-01-01T00:00:00.000Z'

function createSupabase() {
  const events = [
    { id: A.id, slug: A.slug, title: 'Torneo A', ends_at: FUTURE },
    { id: B.id, slug: B.slug, title: 'Torneo B', ends_at: FUTURE },
  ]
  const from = vi.fn((table) => {
    let rows = table === 'events' ? [...events] : []
    const query = {
      select: () => query,
      eq: (column, value) => ((rows = rows.filter((row) => String(row[column]) === String(value))), query),
      in: () => query,
      limit: () => query,
      order: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return query
  })
  return { client: { from, rpc: vi.fn(async () => ({ data: null, error: null })) } }
}

const guardA = {
  id: 'usr-guard-a',
  email: 'puerta-a@plu.test',
  role: 'seguridad_plu_arg',
  status: 'active',
  eventId: A.id,
  eventSlug: A.slug,
  securityZoneId: null,
  profile: { firstName: 'Puerta', lastName: 'A' },
}
const guardB = {
  ...guardA,
  id: 'usr-guard-b',
  email: 'puerta-b@plu.test',
  eventId: B.id,
  eventSlug: B.slug,
  profile: { firstName: 'Puerta', lastName: 'B' },
}

async function setup({ role = 'organizer' } = {}) {
  const actor =
    role === 'organizer'
      ? await buildStaffUser({
          email: 'org-equipo@plu.test',
          eventAccess: [{ eventId: A.id, eventSlug: A.slug }],
        })
      : await buildStaffUser({ email: 'admin-equipo@plu.test' })
  const users = [actor, { ...guardA }, { ...guardB }]
  const zones = [
    { id: 'zone-a', eventId: A.id, eventSlug: A.slug, name: 'Puerta A', scope: 'gate_tickets', sortOrder: 0 },
    { id: 'zone-b', eventId: B.id, eventSlug: B.slug, name: 'Puerta B', scope: 'gate_tickets', sortOrder: 0 },
  ]
  const prisma = createPrismaDouble(users, { zones })
  const supabase = createSupabase()
  const target = listen(
    createApp({
      prisma,
      supabaseAdmin: supabase.client,
      env: { AUTH_SECRET: 'event-scope-team-test-secret', APP_URL: 'http://localhost:5173' },
    }),
  )
  const { cookie } = await loginStaff(target.url, { email: actor.email })
  return { target, cookie, users, zones }
}

async function call(ctx, method, path, body) {
  const response = await fetch(`${ctx.target.url}${path}`, {
    method,
    headers: authHeaders(ctx.cookie),
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

const notAssigned = (result) => result.status === 403 && result.body?.code === 'event_not_assigned'

describe('organizador: zonas del evento', () => {
  it('lista y crea zonas en SU evento, y no en otro', async () => {
    const ctx = await setup()
    try {
      expect((await call(ctx, 'GET', `/api/security-zones?eventId=${A.id}`)).status).toBe(200)
      expect(notAssigned(await call(ctx, 'GET', `/api/security-zones?eventId=${B.id}`))).toBe(true)

      const creada = await call(ctx, 'POST', '/api/security-zones', {
        eventId: A.id,
        eventSlug: A.slug,
        name: 'Plataforma',
        scope: 'gate_tickets',
      })
      expect(creada.status, JSON.stringify(creada.body)).toBe(201)

      const ajena = await call(ctx, 'POST', '/api/security-zones', {
        eventId: B.id,
        eventSlug: B.slug,
        name: 'Plataforma',
        scope: 'gate_tickets',
      })
      expect(notAssigned(ajena)).toBe(true)
      expect(ctx.zones.some((zone) => zone.eventId === B.id && zone.name === 'Plataforma')).toBe(false)
    } finally {
      await ctx.target.close()
    }
  })

  it('id de un evento propio con el slug de uno ajeno no pasa', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'POST', '/api/security-zones', {
        eventId: A.id,
        eventSlug: B.slug,
        name: 'Mezclada',
        scope: 'gate_tickets',
      })
      expect(notAssigned(result)).toBe(true)
      const preset = await call(ctx, 'POST', '/api/security-zones/preset', {
        eventId: B.id,
        eventSlug: A.slug,
      })
      expect(notAssigned(preset)).toBe(true)
    } finally {
      await ctx.target.close()
    }
  })

  it('editar o borrar una zona (que viaja solo por id) de otro evento se corta', async () => {
    const ctx = await setup()
    try {
      const editar = await call(ctx, 'PATCH', '/api/security-zones/zone-b', {
        name: 'Hackeada',
        scope: 'gate_tickets',
      })
      const borrar = await call(ctx, 'DELETE', '/api/security-zones/zone-b')
      expect(notAssigned(editar)).toBe(true)
      expect(notAssigned(borrar)).toBe(true)
      expect(ctx.zones.find((zone) => zone.id === 'zone-b')).toMatchObject({ name: 'Puerta B' })

      const propia = await call(ctx, 'PATCH', '/api/security-zones/zone-a', {
        name: 'Principal',
        scope: 'gate_tickets',
      })
      expect(propia.status, JSON.stringify(propia.body)).toBe(200)
    } finally {
      await ctx.target.close()
    }
  })

  it('asigna a la zona solo cuentas de su evento', async () => {
    const ctx = await setup()
    try {
      const ajena = await call(ctx, 'PATCH', `/api/security-zones/members/${guardB.id}`, {
        zoneId: 'zone-a',
      })
      expect(notAssigned(ajena)).toBe(true)
      const propia = await call(ctx, 'PATCH', `/api/security-zones/members/${guardA.id}`, {
        zoneId: 'zone-a',
      })
      expect(propia.status, JSON.stringify(propia.body)).toBe(200)
      expect(ctx.users.find((user) => user.id === guardA.id).securityZoneId).toBe('zone-a')
    } finally {
      await ctx.target.close()
    }
  })

  it('no puede mover a una zona a alguien que no es una cuenta de seguridad (p. ej. un admin)', async () => {
    const ctx = await setup()
    try {
      const adminId = ctx.users[0].id
      const result = await call(ctx, 'PATCH', `/api/security-zones/members/${adminId}`, {
        zoneId: 'zone-a',
      })
      expect(result.status).toBe(404)
    } finally {
      await ctx.target.close()
    }
  })
})

describe('organizador: cuentas de seguridad', () => {
  it('lista el equipo de su evento y no el de otro', async () => {
    const ctx = await setup()
    try {
      const propio = await call(ctx, 'GET', `/api/auth/security-users?eventId=${A.id}`)
      expect(propio.status).toBe(200)
      expect(propio.body.users.map((user) => user.email)).toEqual([guardA.email])
      expect(notAssigned(await call(ctx, 'GET', `/api/auth/security-users?eventId=${B.id}`))).toBe(true)
    } finally {
      await ctx.target.close()
    }
  })

  it('no puede dar de alta cuentas en un evento ajeno, ni uno solo ni en lote', async () => {
    const ctx = await setup()
    try {
      const uno = await call(ctx, 'POST', '/api/auth/security-users', {
        name: 'Intruso',
        email: 'intruso@plu.test',
        eventId: B.id,
        sendEmail: false,
      })
      expect(notAssigned(uno)).toBe(true)
      const lote = await call(ctx, 'POST', '/api/auth/security-users/bulk', {
        eventId: B.id,
        users: [{ name: 'Intruso', email: 'intruso2@plu.test' }],
        sendEmail: false,
      })
      expect(notAssigned(lote)).toBe(true)
      expect(ctx.users.some((user) => user.email.startsWith('intruso'))).toBe(false)
    } finally {
      await ctx.target.close()
    }
  })

  it('da de alta una cuenta en su propio evento', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'POST', '/api/auth/security-users', {
        name: 'Nuevo Puesto',
        email: 'nuevo@plu.test',
        eventId: A.id,
        sendEmail: false,
      })
      expect(result.status, JSON.stringify(result.body)).toBeLessThan(300)
      expect(ctx.users.find((user) => user.email === 'nuevo@plu.test')).toMatchObject({
        role: 'seguridad_plu_arg',
        eventId: A.id,
      })
    } finally {
      await ctx.target.close()
    }
  })

  it('dar de baja, generar link y baja masiva de cuentas ajenas se cortan (van por id)', async () => {
    const ctx = await setup()
    try {
      const baja = await call(ctx, 'PATCH', `/api/auth/security-users/${guardB.id}/status`, {
        status: 'disabled',
      })
      const link = await call(ctx, 'POST', `/api/auth/security-users/${guardB.id}/access-link`, {
        sendEmail: false,
      })
      const masiva = await call(ctx, 'POST', '/api/auth/security-users/deactivate-all', {
        eventId: B.id,
      })
      expect(notAssigned(baja)).toBe(true)
      expect(notAssigned(link)).toBe(true)
      expect(notAssigned(masiva)).toBe(true)
      expect(ctx.users.find((user) => user.id === guardB.id).status).toBe('active')
    } finally {
      await ctx.target.close()
    }
  })

  it('sobre su equipo sí puede darlo de baja', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'PATCH', `/api/auth/security-users/${guardA.id}/status`, {
        status: 'disabled',
      })
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      expect(ctx.users.find((user) => user.id === guardA.id).status).toBe('disabled')
    } finally {
      await ctx.target.close()
    }
  })

  it('el Super Admin sigue pudiendo con cualquier evento', async () => {
    const ctx = await setup({ role: 'admin' })
    try {
      const result = await call(ctx, 'GET', `/api/auth/security-users?eventId=${B.id}`)
      expect(result.status).toBe(200)
      expect(result.body.users.map((user) => user.email)).toEqual([guardB.email])
    } finally {
      await ctx.target.close()
    }
  })
})
