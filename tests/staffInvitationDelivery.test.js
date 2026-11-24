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

// Los limiters de rate limit comparten balde por IP dentro del archivo: cada
// request manda una IP distinta para que la cantidad de tests no dispare 429.
let ipSeq = 0
function uniqueIp() {
  ipSeq += 1
  return `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`
}

function authHeaders(cookie) {
  return {
    'x-vercel-forwarded-for': uniqueIp(),
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
        const { profile, ...rest } = data
        Object.assign(user, rest)
        if (profile?.update) user.profile = { ...user.profile, ...profile.update }
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

      const reused = await acceptInvitation(
        target.url,
        invitationTokenFrom(send),
        'Otra-clave-segura-2026',
      )
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

  it('devuelve el enlace al panel sólo si lo pide y sirve para activar la cuenta', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: true, send } }))

    try {
      const cookie = await loginAdmin(target.url)
      const sinPedir = await (
        await inviteUser(target.url, cookie, {
          name: 'Sin Enlace',
          email: 'sin@pluarg.test',
          role: 'plu_arg',
          sendEmail: false,
        })
      ).json()
      expect(sinPedir).not.toHaveProperty('invitationUrl')

      const response = await inviteUser(target.url, cookie, {
        name: 'Con Enlace',
        email: 'con@pluarg.test',
        role: 'plu_arg',
        sendEmail: false,
        returnLink: true,
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(send).not.toHaveBeenCalled()
      expect(body.invitationUrl).toMatch(/^https:\/\/panel\.pluarg\.test\/\?invitacion-staff=/)
      expect(Date.parse(body.invitationExpiresAt)).toBeGreaterThan(Date.now())

      const token = new URL(body.invitationUrl).searchParams.get('invitacion-staff')
      const preview = await fetch(
        `${target.url}/api/auth/staff-invitation?token=${encodeURIComponent(token)}`,
      )
      expect(preview.status).toBe(200)
      expect((await preview.json()).invitation).toMatchObject({
        name: 'Con Enlace',
        email: 'con@pluarg.test',
      })

      const accepted = await acceptInvitation(target.url, token)
      expect(accepted.status).toBe(200)

      const usado = await fetch(
        `${target.url}/api/auth/staff-invitation?token=${encodeURIComponent(token)}`,
      )
      expect(usado.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('el reenvío con returnLink devuelve un enlace nuevo y no revela nada con un token falso', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV, brevo: { configured: false } }))

    try {
      const cookie = await loginAdmin(target.url)
      const created = await (
        await inviteUser(target.url, cookie, {
          name: 'Equipo PLU',
          email: 'nuevo@pluarg.test',
          role: 'plu_arg',
          sendEmail: false,
          returnLink: true,
        })
      ).json()
      const reset = await fetch(`${target.url}/api/users/${created.user.id}/reset-password`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ sendEmail: false, returnLink: true }),
      })
      const reissued = await reset.json()

      expect(reset.status).toBe(200)
      expect(reissued.invitationUrl).not.toBe(created.invitationUrl)

      const viejo = new URL(created.invitationUrl).searchParams.get('invitacion-staff')
      const previewViejo = await fetch(
        `${target.url}/api/auth/staff-invitation?token=${encodeURIComponent(viejo)}`,
      )
      expect(previewViejo.status).toBe(400)

      const falso = await fetch(`${target.url}/api/auth/staff-invitation?token=${'x'.repeat(60)}`)
      expect(falso.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  describe('invitación abierta (sin email)', () => {
    async function createOpenInvite(target, cookie) {
      const response = await inviteUser(target.url, cookie, {
        role: 'plu_arg',
        sendEmail: false,
        returnLink: true,
      })
      return { response, body: await response.json() }
    }

    const tokenOf = (body) => new URL(body.invitationUrl).searchParams.get('invitacion-staff')
    const previewOf = (target, token) =>
      fetch(`${target.url}/api/auth/staff-invitation?token=${encodeURIComponent(token)}`, {
        headers: { 'x-vercel-forwarded-for': uniqueIp() },
      })

    it('se crea sólo con el rol y la persona completa nombre, email y clave', async () => {
      const prisma = createPrismaDouble([await buildAdmin()])
      const target = listen(createApp({ prisma, env: ENV, brevo: { configured: false } }))

      try {
        const cookie = await loginAdmin(target.url)
        const { response, body } = await createOpenInvite(target, cookie)

        expect(response.status).toBe(201)
        expect(body.emailed).toBe(false)
        expect(body.user.email).toMatch(/@pendiente\.invalid$/)

        const token = tokenOf(body)
        const preview = (await (await previewOf(target, token)).json()).invitation
        expect(preview).toMatchObject({ needsProfile: true, name: '', email: '' })

        // Sin sus datos no se puede activar.
        const incompleta = await acceptInvitation(target.url, token)
        expect(incompleta.status).toBe(400)

        const accepted = await fetch(`${target.url}/api/auth/accept-staff-invitation`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            token,
            password: 'Nueva-clave-segura-2026',
            name: 'Lucía Fernández',
            email: 'Lucia@PLUarg.test',
          }),
        })
        const session = await accepted.json()

        expect(accepted.status).toBe(200)
        expect(session.user).toMatchObject({
          email: 'lucia@pluarg.test',
          status: 'active',
          mustChangePassword: false,
        })

        const reused = await acceptInvitation(target.url, token, 'Otra-clave-segura-2026')
        expect(reused.status).toBe(400)
      } finally {
        await target.close()
      }
    })

    it('rechaza un email que ya tiene cuenta sin gastar la invitación', async () => {
      const prisma = createPrismaDouble([await buildAdmin()])
      const target = listen(createApp({ prisma, env: ENV, brevo: { configured: false } }))

      try {
        const cookie = await loginAdmin(target.url)
        const { body } = await createOpenInvite(target, cookie)
        const token = tokenOf(body)

        const taken = await fetch(`${target.url}/api/auth/accept-staff-invitation`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            token,
            password: 'Nueva-clave-segura-2026',
            name: 'Otra Persona',
            email: 'admin@pluarg.test',
          }),
        })
        expect(taken.status).toBe(409)

        // El enlace sigue vigente para reintentar con otro email.
        expect((await previewOf(target, token)).status).toBe(200)
      } finally {
        await target.close()
      }
    })

    it('no deja registrarse con el email reservado y no manda mail al reenviar', async () => {
      const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
      const prisma = createPrismaDouble([await buildAdmin()])
      const target = listen(createApp({ prisma, env: ENV, brevo: { configured: true, send } }))

      try {
        const cookie = await loginAdmin(target.url)
        const { body } = await createOpenInvite(target, cookie)

        const reset = await fetch(`${target.url}/api/users/${body.user.id}/reset-password`, {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ sendEmail: true, returnLink: true }),
        })
        const reissued = await reset.json()
        expect(reset.status).toBe(200)
        expect(reissued.emailed).toBe(false)
        expect(send).not.toHaveBeenCalled()

        const reservado = await fetch(`${target.url}/api/auth/accept-staff-invitation`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            token: tokenOf(reissued),
            password: 'Nueva-clave-segura-2026',
            name: 'Alguien Más',
            email: 'x@pendiente.invalid',
          }),
        })
        expect(reservado.status).toBe(400)
      } finally {
        await target.close()
      }
    })
  })
})
