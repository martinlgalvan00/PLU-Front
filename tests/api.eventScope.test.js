import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { canAccessEvent, eventScopeOf } from '../server/lib/eventScope.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const EVENT_A = { eventId: '11111111-1111-4111-8111-111111111111', eventSlug: 'torneo-a-2026' }
const EVENT_B = { eventId: '22222222-2222-4222-8222-222222222222', eventSlug: 'torneo-b-2026' }

function supabaseDouble() {
  const rows = { data: [], error: null }
  const chain = () => {
    const q = {
      select: () => q,
      order: () => q,
      eq: () => q,
      in: () => q,
      limit: () => q,
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    }
    return q
  }
  return { from: vi.fn(chain), rpc: vi.fn(async () => ({ data: null, error: null })) }
}

async function boot(users) {
  const prisma = createPrismaDouble(users)
  const target = listen(createApp({ prisma, supabaseAdmin: supabaseDouble() }))
  return { target, prisma }
}

async function call(target, cookie, method, path, body) {
  const response = await fetch(`${target.url}${path}`, {
    method,
    headers: authHeaders(cookie),
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    // sin cuerpo JSON
  }
  return { status: response.status, body: json }
}

describe('rol por evento: candado por defecto', () => {
  it('la sesión de un organizador se sabe por evento y trae solo sus eventos', async () => {
    const organizer = await buildStaffUser({
      email: 'org-sesion@plu.test',
      eventAccess: [EVENT_A],
    })
    const { target } = await boot([organizer])
    try {
      const { cookie } = await loginStaff(target.url, { email: organizer.email })
      const me = await call(target, cookie, 'GET', '/api/auth/me')

      expect(me.status).toBe(200)
      expect(me.body.user).toMatchObject({
        roleKey: 'organizador_evento',
        eventScoped: true,
        eventAccess: [EVENT_A],
      })
      // Sus permisos son los del rol, sin nada global.
      expect(me.body.user.permissions).toEqual(
        expect.arrayContaining(['admin.events.read', 'admin.payments.approve']),
      )
      expect(me.body.user.permissions).not.toContain('admin.users.write')
      expect(me.body.user.permissions).not.toContain('admin.events.delete')
    } finally {
      await target.close()
    }
  })

  it('tener el permiso no alcanza: una ruta que no declara filtrar por evento le da 403', async () => {
    const organizer = await buildStaffUser({
      email: 'org-candado@plu.test',
      eventAccess: [EVENT_A],
    })
    const { target } = await boot([organizer])
    try {
      const { cookie } = await loginStaff(target.url, { email: organizer.email })
      // `GET /api/events` exige admin.events.read, que el organizador SÍ tiene.
      const denied = await call(target, cookie, 'GET', '/api/events')

      expect(denied.status).toBe(403)
      expect(denied.body.code).toBe('event_scope_denied')
    } finally {
      await target.close()
    }
  })

  it('el Super Admin y las cuentas actuales no cambian: el candado no los toca', async () => {
    const admin = await buildStaffUser({ email: 'admin-sin-candado@plu.test' })
    const { target } = await boot([admin])
    try {
      const { cookie } = await loginStaff(target.url, { email: admin.email })
      const response = await call(target, cookie, 'GET', '/api/events')

      expect(response.status).not.toBe(403)
      expect(response.body?.code).not.toBe('event_scope_denied')
    } finally {
      await target.close()
    }
  })

  it('cambiar su propia contraseña sigue habilitado (si no, no podría salir de la clave temporal)', async () => {
    const organizer = await buildStaffUser({
      email: 'org-clave@plu.test',
      eventAccess: [EVENT_A],
    })
    const { target } = await boot([organizer])
    try {
      const { cookie } = await loginStaff(target.url, { email: organizer.email })
      const response = await call(target, cookie, 'POST', '/api/auth/me/password', {
        currentPassword: 'incorrecta-123',
        newPassword: 'OtraClaveNueva-2026!',
      })

      // Llega al handler (rechaza la clave actual), no al candado.
      expect(response.body?.code).not.toBe('event_scope_denied')
      expect(response.status).not.toBe(403)
    } finally {
      await target.close()
    }
  })

  it('sin sesión sigue siendo 401', async () => {
    const { target } = await boot([])
    try {
      const response = await call(target, null, 'GET', '/api/events')
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})

describe('compatibilidad con una base sin migrar', () => {
  // La migración de `UserEventAccess` se aplica a mano antes del despliegue. Si el
  // backend nuevo sale primero, el staff común no puede romperse: la tabla se
  // consulta SOLO para cuentas de rol por evento, que todavía no existen.
  it('una cuenta común nunca consulta los eventos asignados; la de organizador sí', async () => {
    const admin = await buildStaffUser({ email: 'admin-sin-tabla@plu.test' })
    const organizer = await buildStaffUser({
      email: 'org-con-tabla@plu.test',
      eventAccess: [EVENT_A],
    })
    const prisma = createPrismaDouble([admin, organizer])
    const findMany = vi.spyOn(prisma.userEventAccess, 'findMany')
    const target = listen(createApp({ prisma, supabaseAdmin: supabaseDouble() }))
    try {
      const adminSession = await loginStaff(target.url, { email: admin.email })
      await call(target, adminSession.cookie, 'GET', '/api/auth/me')
      await call(target, adminSession.cookie, 'GET', '/api/events')
      expect(findMany).not.toHaveBeenCalled()

      const orgSession = await loginStaff(target.url, { email: organizer.email })
      await call(target, orgSession.cookie, 'GET', '/api/auth/me')
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: organizer.id } }),
      )
    } finally {
      await target.close()
    }
  })
})

describe('eventScope: quién puede operar sobre qué evento', () => {
  const req = (user) => ({ auth: { user } })
  const organizer = req({ eventScoped: true, eventAccess: [EVENT_A] })

  it('una cuenta sin alcance por evento no tiene restricción', () => {
    expect(eventScopeOf(req({ eventScoped: false }))).toBeNull()
    expect(canAccessEvent(req({ eventScoped: false }), { slug: 'cualquiera' })).toBe(true)
  })

  it('el organizador solo accede a sus eventos, por id o por slug', () => {
    expect(canAccessEvent(organizer, { eventId: EVENT_A.eventId })).toBe(true)
    expect(canAccessEvent(organizer, { slug: EVENT_A.eventSlug })).toBe(true)
    expect(canAccessEvent(organizer, { eventId: EVENT_B.eventId })).toBe(false)
    expect(canAccessEvent(organizer, { slug: EVENT_B.eventSlug })).toBe(false)
  })

  it('id y slug de eventos distintos no se avalan entre sí', () => {
    // Slug propio + id ajeno (y al revés): un campo no puede habilitar al otro.
    expect(
      canAccessEvent(organizer, { eventId: EVENT_B.eventId, slug: EVENT_A.eventSlug }),
    ).toBe(false)
    expect(
      canAccessEvent(organizer, { eventId: EVENT_A.eventId, slug: EVENT_B.eventSlug }),
    ).toBe(false)
    expect(
      canAccessEvent(organizer, { eventId: EVENT_A.eventId, slug: EVENT_A.eventSlug }),
    ).toBe(true)
  })

  it('sin identificar el evento se deniega, y sin eventos asignados no ve ninguno', () => {
    expect(canAccessEvent(organizer, {})).toBe(false)
    const empty = req({ eventScoped: true, eventAccess: [] })
    expect(canAccessEvent(empty, { slug: EVENT_A.eventSlug })).toBe(false)
    expect(eventScopeOf(empty)).not.toBeNull()
  })
})
