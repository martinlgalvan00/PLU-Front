import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'
import { createStaffEmailChangeToken } from '../server/services/staffEmailChangeToken.js'

/**
 * Ciclo de vida de la credencial de una cuenta del panel: la contraseña
 * temporal sólo habilita a cambiarla, y el cambio de email es en dos pasos.
 */

const ENV = { AUTH_SECRET: 'test-secret-ciclo-credencial-plu', APP_URL: 'http://localhost:5173' }

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/**
 * `authLimiter` es una instancia de módulo compartida por todos los tests del
 * archivo (20 intentos / 15 min por IP), así que sin aislar la clave el
 * archivo se autolimita al crecer. `clientKey` lee `x-vercel-forwarded-for`
 * antes que `req.ip`, así que alcanza con darle a cada caso su propia IP.
 */
let clientSeq = 0
const nextClientIp = () => `203.0.113.${(clientSeq += 1) % 250}`
let currentClientIp = nextClientIp()

function isolateRateLimit() {
  currentClientIp = nextClientIp()
}

function authHeaders(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    'X-Vercel-Forwarded-For': currentClientIp,
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
  const sessions = []
  const auditLogs = []

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
      // Revocación real: sin esto no se puede verificar que cambiar la clave o
      // el email efectivamente expulsa a las sesiones abiertas.
      updateMany: async ({ where, data }) => {
        const affected = sessions.filter(
          (item) => item.userId === where.userId && item.revokedAt === null,
        )
        affected.forEach((item) => Object.assign(item, data))
        return { count: affected.length }
      },
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

async function buildInvitedAdmin(tempPassword) {
  return {
    id: 'usr-invitado',
    email: 'nuevo@pluarg.test',
    passwordHash: await hashPassword(tempPassword),
    mustChangePassword: true,
    role: 'admin_plu_arg',
    status: 'active',
    profile: { firstName: 'Cuenta', lastName: 'Nueva' },
    eventId: null,
    eventSlug: null,
  }
}

async function login(url, email, password) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  })
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  }
}

describe('contraseña temporal de staff', () => {
  it('deja entrar pero bloquea el panel hasta elegir una contraseña propia', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildInvitedAdmin('temporal-abc123')])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')

      expect(session.status).toBe(200)
      expect(session.body.user.mustChangePassword).toBe(true)

      // El panel queda cerrado del lado del servidor, no sólo en la UI.
      const listado = await fetch(`${target.url}/api/users`, {
        headers: authHeaders(session.cookie),
      })
      const error = await listado.json()

      expect(listado.status).toBe(403)
      expect(error.code).toBe('password_change_required')
    } finally {
      await target.close()
    }
  })

  it('libera el panel al cambiar la contraseña y renueva la sesión', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildInvitedAdmin('temporal-abc123')])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')
      const cambio = await fetch(`${target.url}/api/auth/me/password`, {
        method: 'POST',
        headers: authHeaders(session.cookie),
        body: JSON.stringify({
          currentPassword: 'temporal-abc123',
          password: 'mi-clave-propia-2026',
        }),
      })
      const body = await cambio.json()
      const nuevaCookie = cambio.headers.get('set-cookie')?.split(';')[0]

      expect(cambio.status).toBe(200)
      expect(body.user.mustChangePassword).toBe(false)

      const listado = await fetch(`${target.url}/api/users`, {
        headers: authHeaders(nuevaCookie),
      })
      expect(listado.status).toBe(200)

      // La cookie vieja se cortó: si la temporal circuló por mail, cambiarla
      // tiene que expulsar a quien la haya usado.
      const conCookieVieja = await fetch(`${target.url}/api/users`, {
        headers: authHeaders(session.cookie),
      })
      expect(conCookieVieja.status).toBe(401)

      // Y la contraseña vieja ya no entra.
      const reintento = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')
      expect(reintento.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('rechaza la credencial vencida, y sólo se lo dice a quien la tenía bien', async () => {
    isolateRateLimit()
    const vencida = await buildInvitedAdmin('temporal-abc123')
    vencida.passwordExpiresAt = new Date(Date.now() - 60_000)
    const prisma = createPrismaDouble([vencida])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const conCorrecta = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')
      expect(conCorrecta.status).toBe(401)
      expect(conCorrecta.body.code).toBe('temp_password_expired')

      // Con la contraseña equivocada vuelve el 401 genérico: el aviso de
      // vencimiento no puede servir para descubrir qué cuentas existen.
      const conIncorrecta = await login(target.url, 'nuevo@pluarg.test', 'no-es-la-mia')
      expect(conIncorrecta.status).toBe(401)
      expect(conIncorrecta.body.code).toBeUndefined()
    } finally {
      await target.close()
    }
  })

  it('una credencial vigente entra normalmente', async () => {
    isolateRateLimit()
    const vigente = await buildInvitedAdmin('temporal-abc123')
    vigente.passwordExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const prisma = createPrismaDouble([vigente])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')
      expect(session.status).toBe(200)
      expect(session.body.user.mustChangePassword).toBe(true)
    } finally {
      await target.close()
    }
  })

  it('la contraseña propia no caduca: limpia el vencimiento al elegirla', async () => {
    isolateRateLimit()
    const invitado = await buildInvitedAdmin('temporal-abc123')
    invitado.passwordExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const prisma = createPrismaDouble([invitado])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')
      await fetch(`${target.url}/api/auth/me/password`, {
        method: 'POST',
        headers: authHeaders(session.cookie),
        body: JSON.stringify({
          currentPassword: 'temporal-abc123',
          password: 'mi-clave-propia-2026',
        }),
      })

      expect(prisma._state.users[0].passwordExpiresAt).toBeNull()
      expect(prisma._state.users[0].mustChangePassword).toBe(false)
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) el cambio si la contraseña actual no coincide', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildInvitedAdmin('temporal-abc123')])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'nuevo@pluarg.test', 'temporal-abc123')
      const cambio = await fetch(`${target.url}/api/auth/me/password`, {
        method: 'POST',
        headers: authHeaders(session.cookie),
        body: JSON.stringify({
          currentPassword: 'no-es-la-mia',
          password: 'mi-clave-propia-2026',
        }),
      })

      expect(cambio.status).toBe(400)
      expect(prisma._state.users[0].mustChangePassword).toBe(true)
    } finally {
      await target.close()
    }
  })
})

describe('cambio de email de staff', () => {
  async function buildActiveAdmin() {
    return {
      id: 'usr-admin',
      email: 'viejo@pluarg.test',
      passwordHash: await hashPassword('clave-admin-vigente'),
      mustChangePassword: false,
      role: 'admin_plu_arg',
      status: 'active',
      profile: { firstName: 'Admin', lastName: 'PLU' },
      eventId: null,
      eventSlug: null,
    }
  }

  it('no cambia nada al pedirlo: sólo emite el pedido', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildActiveAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'viejo@pluarg.test', 'clave-admin-vigente')
      const pedido = await fetch(`${target.url}/api/auth/me/email`, {
        method: 'POST',
        headers: authHeaders(session.cookie),
        body: JSON.stringify({
          email: 'nuevo@pluarg.test',
          currentPassword: 'clave-admin-vigente',
        }),
      })
      const body = await pedido.json()

      expect(pedido.status).toBe(200)
      expect(body.pendingEmail).toBe('nuevo@pluarg.test')
      // Hasta confirmar, la identidad de login sigue siendo la vieja.
      expect(prisma._state.users[0].email).toBe('viejo@pluarg.test')
    } finally {
      await target.close()
    }
  })

  it('exige la contraseña actual para pedirlo', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildActiveAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'viejo@pluarg.test', 'clave-admin-vigente')
      const pedido = await fetch(`${target.url}/api/auth/me/email`, {
        method: 'POST',
        headers: authHeaders(session.cookie),
        body: JSON.stringify({ email: 'nuevo@pluarg.test', currentPassword: 'no-es-la-mia' }),
      })

      expect(pedido.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('aplica el cambio al confirmar el token y corta las sesiones abiertas', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildActiveAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const session = await login(target.url, 'viejo@pluarg.test', 'clave-admin-vigente')
      const token = createStaffEmailChangeToken({
        userId: 'usr-admin',
        email: 'nuevo@pluarg.test',
        secret: ENV.AUTH_SECRET,
      })

      const confirmacion = await fetch(`${target.url}/api/auth/verify-email-change`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token }),
      })
      const body = await confirmacion.json()

      expect(confirmacion.status).toBe(200)
      expect(body).toEqual({ email: 'nuevo@pluarg.test', alreadyApplied: false })
      expect(prisma._state.users[0].email).toBe('nuevo@pluarg.test')
      expect(prisma._state.auditLogs).toContainEqual(
        expect.objectContaining({ action: 'user.email_changed', entityId: 'usr-admin' }),
      )

      // El email es la identidad de login: la sesión abierta se corta.
      const conCookieVieja = await fetch(`${target.url}/api/users`, {
        headers: authHeaders(session.cookie),
      })
      expect(conCookieVieja.status).toBe(401)

      const reingreso = await login(target.url, 'nuevo@pluarg.test', 'clave-admin-vigente')
      expect(reingreso.status).toBe(200)
    } finally {
      await target.close()
    }
  })

  it('es idempotente si el link ya se usó', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildActiveAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const token = createStaffEmailChangeToken({
        userId: 'usr-admin',
        email: 'nuevo@pluarg.test',
        secret: ENV.AUTH_SECRET,
      })
      const url = `${target.url}/api/auth/verify-email-change`
      const primera = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token }),
      })
      const segunda = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token }),
      })

      expect(primera.status).toBe(200)
      expect(segunda.status).toBe(200)
      expect(await segunda.json()).toEqual({
        email: 'nuevo@pluarg.test',
        alreadyApplied: true,
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza (409) confirmar hacia un email que se ocupó mientras tanto', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([
      await buildActiveAdmin(),
      {
        id: 'usr-otro',
        email: 'nuevo@pluarg.test',
        passwordHash: await hashPassword('otra-clave-cualquiera'),
        mustChangePassword: false,
        role: 'operador_plu_arg',
        status: 'active',
        profile: { firstName: 'Otra', lastName: 'Cuenta' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const token = createStaffEmailChangeToken({
        userId: 'usr-admin',
        email: 'nuevo@pluarg.test',
        secret: ENV.AUTH_SECRET,
      })
      const confirmacion = await fetch(`${target.url}/api/auth/verify-email-change`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token }),
      })

      expect(confirmacion.status).toBe(409)
      expect(prisma._state.users[0].email).toBe('viejo@pluarg.test')
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) un token firmado con otro secreto', async () => {
    isolateRateLimit()
    const prisma = createPrismaDouble([await buildActiveAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const token = createStaffEmailChangeToken({
        userId: 'usr-admin',
        email: 'nuevo@pluarg.test',
        secret: 'otro-secreto-distinto-del-server',
      })
      const confirmacion = await fetch(`${target.url}/api/auth/verify-email-change`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token }),
      })

      expect(confirmacion.status).toBe(400)
      expect(prisma._state.users[0].email).toBe('viejo@pluarg.test')
    } finally {
      await target.close()
    }
  })
})
