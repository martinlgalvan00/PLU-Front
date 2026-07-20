import { describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './helpers/staffSession.js'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

const EVENT_SLUG = 'pitbull-classic-2026'
const supabaseAdmin = createSupabaseTestClient()

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

async function bootAdmin() {
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('id, slug, title')
    .eq('slug', EVENT_SLUG)
    .single()
  if (error) throw new Error(`No se pudo preparar el evento de seguridad: ${error.message}`)

  const admin = await buildStaffUser({ role: 'admin_maximal', email: 'admin-bulk@pluarg.test' })
  const users = [admin]
  const prisma = createPrismaDouble(users, { events: [event] })
  const target = listen(createApp({ prisma, supabaseAdmin }))
  const { cookie } = await loginStaff(target.url, { email: admin.email })
  return { target, cookie, users, event }
}

describe('alta masiva de cuentas de seguridad', () => {
  it('crea las cuentas nuevas y omite las que ya existen (partial success)', async () => {
    const { target, cookie, users, event } = await bootAdmin()

    try {
      const response = await fetch(`${target.url}/api/auth/security-users/bulk`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: event.id,
          users: [
            { name: 'Juan Portero', email: 'juan@pluarg.test' },
            { name: 'Maria Puerta', email: 'maria@pluarg.test' },
            // Ya existe (es el admin logueado) -> debe caer en skipped.
            { name: 'Admin Bulk', email: 'admin-bulk@pluarg.test' },
          ],
        }),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.created).toHaveLength(2)
      expect(body.created.map((item) => item.user.email).sort()).toEqual([
        'juan@pluarg.test',
        'maria@pluarg.test',
      ])
      expect(body.created.every((item) => item.tempPassword?.length > 0)).toBe(true)
      expect(body.created.every((item) => item.emailed === false)).toBe(true)
      expect(body.skipped).toEqual([{ email: 'admin-bulk@pluarg.test', reason: 'exists' }])

      // Las cuentas creadas quedan como seguridad_plu_arg atadas al evento.
      const created = users.filter((user) => user.role === 'seguridad_plu_arg')
      expect(created).toHaveLength(2)
      expect(created.every((user) => user.eventId === event.id && user.status === 'active')).toBe(
        true,
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) emails duplicados dentro del mismo lote', async () => {
    const { target, cookie, event } = await bootAdmin()

    try {
      const response = await fetch(`${target.url}/api/auth/security-users/bulk`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: event.id,
          users: [
            { name: 'Repetido Uno', email: 'dup@pluarg.test' },
            { name: 'Repetido Dos', email: 'dup@pluarg.test' },
          ],
        }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('da de baja todas las cuentas activas del evento en una sola operación', async () => {
    const { target, cookie, users, event } = await bootAdmin()

    try {
      await fetch(`${target.url}/api/auth/security-users/bulk`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: event.id,
          users: [
            { name: 'Guardia Uno', email: 'g1@pluarg.test' },
            { name: 'Guardia Dos', email: 'g2@pluarg.test' },
          ],
        }),
      })

      const response = await fetch(`${target.url}/api/auth/security-users/deactivate-all`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ eventId: event.id }),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.deactivated).toBe(2)
      const security = users.filter((user) => user.role === 'seguridad_plu_arg')
      expect(security.every((user) => user.status === 'disabled')).toBe(true)
    } finally {
      await target.close()
    }
  })

  it('bloquea el alta masiva sin permiso de gestión de usuarios', async () => {
    const staff = await buildStaffUser({
      role: 'operador_plu_arg',
      email: 'operador-bulk@pluarg.test',
    })
    const prisma = createPrismaDouble([staff])
    const target = listen(createApp({ prisma }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/auth/security-users/bulk`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: 'evt-pitbull-2026',
          users: [{ name: 'Guardia', email: 'guardia@pluarg.test' }],
        }),
      })

      expect(response.status).toBe(403)
    } finally {
      await target.close()
    }
  })
})
