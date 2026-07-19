import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'
import { createAccessToken } from '../server/services/securityAccessToken.js'

const SECRET = 'test-secret-credenciales-de-acceso-plu'
const ENV = { AUTH_SECRET: SECRET, APP_URL: 'http://localhost:5173' }
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
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createPrismaDouble(users) {
  const sessions = []
  return {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((user) => user.email === where.email) ?? null
        return users.find((user) => user.id === where.id) ?? null
      },
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
      },
    },
    session: {
      create: async ({ data }) => {
        const session = { id: `ses-${sessions.length + 1}`, ...data }
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
  }
}

async function buildGuard(overrides = {}) {
  return {
    id: 'usr-guard',
    email: 'guard@pluarg.test',
    passwordHash: await hashPassword('irrelevante'),
    role: 'seguridad_plu_arg',
    status: 'active',
    profile: { firstName: 'Guardia', lastName: 'Uno' },
    eventId: 'evt-1',
    event: { id: 'evt-1', slug: 'pitbull-classic-2026', title: 'Pitbull Classic' },
    ...overrides,
  }
}

async function buildAdmin() {
  return {
    id: 'usr-admin',
    email: 'admin@pluarg.test',
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role: 'admin_maximal',
    status: 'active',
    profile: { firstName: 'Admin', lastName: 'Max' },
    eventId: null,
    event: null,
  }
}

async function loginAdmin(url, admin) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email: admin.email, password: ADMIN_PASSWORD }),
  })
  return response.headers.get('set-cookie')?.split(';')[0]
}

const gateToken = (guard, ttlMs = 60_000) =>
  createAccessToken({ userId: guard.id, eventId: guard.eventId, expiresAt: new Date(Date.now() + ttlMs), secret: SECRET })

describe('security-gate (login por credencial de acceso)', () => {
  it('deja entrar con un token válido y setea la cookie de sesión', async () => {
    const guard = await buildGuard()
    const target = listen(createApp({ prisma: createPrismaDouble([guard]), env: ENV }))

    try {
      const response = await fetch(`${target.url}/api/auth/security-gate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: gateToken(guard) }),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('set-cookie')).toContain('HttpOnly')
      expect(body.user).toMatchObject({ id: 'usr-guard', role: 'seguridad_plu_arg', eventSlug: 'pitbull-classic-2026' })
    } finally {
      await target.close()
    }
  })

  it('rechaza (401) un token alterado', async () => {
    const guard = await buildGuard()
    const target = listen(createApp({ prisma: createPrismaDouble([guard]), env: ENV }))

    try {
      const [payload] = gateToken(guard).split('.')
      const response = await fetch(`${target.url}/api/auth/security-gate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: `${payload}.firmafalsa` }),
      })

      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('rechaza (401) el token de una cuenta dada de baja', async () => {
    const guard = await buildGuard({ status: 'disabled' })
    const target = listen(createApp({ prisma: createPrismaDouble([guard]), env: ENV }))

    try {
      const response = await fetch(`${target.url}/api/auth/security-gate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: gateToken({ id: 'usr-guard', eventId: 'evt-1' }) }),
      })

      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})

describe('access-link (generación de credencial)', () => {
  it('un admin genera un link con token que después sirve para entrar', async () => {
    const admin = await buildAdmin()
    const guard = await buildGuard()
    const target = listen(createApp({ prisma: createPrismaDouble([admin, guard]), env: ENV }))

    try {
      const cookie = await loginAdmin(target.url, admin)

      const linkResponse = await fetch(`${target.url}/api/auth/security-users/${guard.id}/access-link`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ sendEmail: false }),
      })
      const link = await linkResponse.json()

      expect(linkResponse.status).toBe(200)
      expect(link.url).toContain('/evento/pitbull-classic-2026/seguridad?acceso=')
      expect(link.emailed).toBe(false)
      expect(typeof link.token).toBe('string')

      // El token emitido sirve para entrar por la puerta.
      const gateResponse = await fetch(`${target.url}/api/auth/security-gate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: link.token }),
      })
      expect(gateResponse.status).toBe(200)
    } finally {
      await target.close()
    }
  })

  it('bloquea la generación de credenciales sin sesión (401)', async () => {
    const guard = await buildGuard()
    const target = listen(createApp({ prisma: createPrismaDouble([guard]), env: ENV }))

    try {
      const response = await fetch(`${target.url}/api/auth/security-users/${guard.id}/access-link`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sendEmail: false }),
      })

      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
