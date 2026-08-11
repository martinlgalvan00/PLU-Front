import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'

/**
 * Entrega de la invitación de staff, de punta a punta.
 *
 * El resto de los tests verifican las piezas por separado. Este cierra el lazo
 * que importa operativamente: **el enlace que sale por mail permite elegir la
 * contraseña y abre la aplicación** sin exponer credenciales en logs/respuestas.
 */

const ENV = {
  AUTH_SECRET: 'test-secret-entrega-invitacion-plu',
  APP_URL: 'https://panel.pluarg.test',
}
const ADMIN_PASSWORD = 'clave-admin-123'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function authHeaders(cookie) {
  return {
    // El guard de mutación valida el origen contra process.env, no contra el
    // env inyectado: se usa el loopback que ya está en la allowlist. APP_URL
    // igual queda distinto a propósito, para verificar el link del mail.
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
  const sessions = []
  const auditLogs = []
  let seq = users.length

  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((user) => user.email === where.email) ?? null
        return users.find((user) => user.id === where.id) ?? null
      },
      findMany: async ({ where }) => {
        const roles = where?.role?.in
        return users.filter((user) => (roles ? roles.includes(user.role) : true))
      },
      create: async ({ data }) => {
        seq += 1
        const user = {
          id: `usr-${seq}`,
          email: data.email,
          role: data.role,
          status: data.status,
          passwordHash: data.passwordHash ?? null,
          mustChangePassword: data.mustChangePassword ?? false,
          passwordExpiresAt: data.passwordExpiresAt ?? null,
          eventId: null,
          eventSlug: null,
          profile: data.profile?.create ?? null,
        }
        users.push(user)
        return user
      },
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
      },
    },
    session: {
      create: async ({ data }) => {
        const session = { id: `ses-${sessions.length + 1}`, revokedAt: null, ...data }
        sessions.push(session)
        return session
      },
      findUnique: async ({ where }) => {
        const session = sessions.find((item) => item.tokenHash === where.tokenHash)
        if (!session) return null
        return { ...session, user: users.find((user) => user.id === session.userId) }
      },
      updateMany: async () => ({ count: 0 }),
    },
    auditLog: {
      create: async ({ data }) => {
        const auditLog = { id: `audit-${auditLogs.length + 1}`, ...data }
        auditLogs.push(auditLog)
        return auditLog
      },
    },
  }

  prisma.$transaction = async (callback) => callback(prisma)
  prisma._state = { auditLogs, sessions, users }
  return prisma
}

async function buildAdmin(role = 'admin_plu_arg') {
  return {
    id: 'usr-admin',
    email: 'admin@pluarg.test',
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    mustChangePassword: false,
    role,
    status: 'active',
    profile: { firstName: 'Admin', lastName: 'PLU' },
    eventId: null,
    eventSlug: null,
  }
}

async function loginAdmin(url) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email: 'admin@pluarg.test', password: ADMIN_PASSWORD }),
  })
  return response.headers.get('set-cookie')?.split(';')[0]
}

function inviteUser(url, cookie, body) {
  return fetch(`${url}/api/users`, {
    method: 'POST',
    headers: authHeaders(cookie),
    body: JSON.stringify(body),
  })
}

function invitationTokenFrom(send, callIndex = 0) {
  const invitationUrl = send.mock.calls[callIndex][0].params.invitationUrl
  return new URL(invitationUrl).searchParams.get('invitacion-staff')
}

function acceptInvitation(url, token, password = 'Nueva-clave-segura-2026') {
  return fetch(`${url}/api/auth/accept-staff-invitation`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ token, password }),
  })
}

describe('entrega de la invitación de staff', () => {
  it('manda un enlace de un solo uso que permite elegir la clave y abrir la app', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: true, send } }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await inviteUser(target.url, cookie, {
        name: 'Equipo PLU',
        email: 'nuevo@pluarg.test',
        role: 'plu_arg',
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.emailed).toBe(true)
      expect(send).toHaveBeenCalledTimes(1)

      const payload = send.mock.calls[0][0]
      expect(payload.to).toBe('nuevo@pluarg.test')

      expect(payload.params.email).toBe('nuevo@pluarg.test')
      expect(payload.params.invitationUrl).toMatch(
        /^https:\/\/panel\.pluarg\.test\/\?invitacion-staff=/,
      )
      expect(body).not.toHaveProperty('tempPassword')
      expect(payload.params).not.toHaveProperty('tempPassword')
      expect(payload.htmlContent).not.toContain('Contraseña temporal')

      const accepted = await acceptInvitation(target.url, invitationTokenFrom(send))
      const session = await accepted.json()

      expect(accepted.status).toBe(200)
      expect(accepted.headers.get('set-cookie')).toContain('plu_session=')
      expect(session.user).toMatchObject({ status: 'active', mustChangePassword: false })

      const reused = await acceptInvitation(target.url, invitationTokenFrom(send), 'Otra-clave-segura-2026')
      expect(reused.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('no deja la cuenta a medias si el envío falla: el alta se confirma igual', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Brevo caído'))
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: true, send } }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await inviteUser(target.url, cookie, {
        name: 'Equipo PLU',
        email: 'nuevo@pluarg.test',
        role: 'plu_arg',
      })
      const body = await response.json()

      // La cuenta queda invitada y no se filtra una vía alternativa. El admin
      // puede reemitir el enlace cuando Brevo vuelva.
      expect(response.status).toBe(201)
      expect(body.emailed).toBe(false)
      expect(body).not.toHaveProperty('tempPassword')
      expect(body.user.status).toBe('invited')
    } finally {
      await target.close()
    }
  })

  it('informa emailed:false cuando Brevo no está configurado, sin fingir el envío', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: false } }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await inviteUser(target.url, cookie, {
        name: 'Equipo PLU',
        email: 'nuevo@pluarg.test',
        role: 'plu_arg',
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.emailed).toBe(false)
    } finally {
      await target.close()
    }
  })

  it('respeta sendEmail:false sin exponer una credencial por pantalla', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: true, send } }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await inviteUser(target.url, cookie, {
        name: 'Equipo PLU',
        email: 'nuevo@pluarg.test',
        role: 'plu_arg',
        sendEmail: false,
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(send).not.toHaveBeenCalled()
      expect(body).not.toHaveProperty('tempPassword')
      expect(body.user.status).toBe('invited')
    } finally {
      await target.close()
    }
  })

  it('el reenvío invalida el enlace anterior y manda uno nuevo', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: true, send } }))

    try {
      const cookie = await loginAdmin(target.url)
      const created = await (
        await inviteUser(target.url, cookie, {
          name: 'Equipo PLU',
          email: 'nuevo@pluarg.test',
          role: 'plu_arg',
        })
      ).json()

      const reset = await fetch(`${target.url}/api/users/${created.user.id}/reset-password`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ sendEmail: true }),
      })
      const reissued = await reset.json()

      expect(reset.status).toBe(200)
      expect(reissued.emailed).toBe(true)
      expect(reissued).not.toHaveProperty('tempPassword')

      // Dos envíos distintos: la idempotencia del dispatcher no puede tragarse
      // el reenvío, o el usuario nunca recibiría la credencial nueva.
      expect(send).toHaveBeenCalledTimes(2)
      const firstToken = invitationTokenFrom(send, 0)
      const secondToken = invitationTokenFrom(send, 1)
      expect(secondToken).not.toBe(firstToken)

      const conVieja = await acceptInvitation(target.url, firstToken)
      const conNueva = await acceptInvitation(target.url, secondToken)

      expect(conVieja.status).toBe(400)
      expect(conNueva.status).toBe(200)
    } finally {
      await target.close()
    }
  })
})
