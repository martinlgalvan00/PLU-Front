import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

function authHeaders(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createAuth0Middleware(payload) {
  return (req, _res, next) => {
    req.auth = { payload }
    next()
  }
}

function createPrismaDouble(users) {
  const sessions = []
  const identities = []

  return {
    user: {
      findUnique: async ({ where }) => {
        const user = users.find((item) => item.email === where.email)
        if (!user) return null
        return {
          ...user,
          identities: identities.filter((identity) => identity.userId === user.id),
        }
      },
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
      },
    },
    userIdentity: {
      findUnique: async ({ where }) => {
        const identity = identities.find((item) => {
          return (
            item.provider === where.provider_providerSubject.provider &&
            item.providerSubject === where.provider_providerSubject.providerSubject
          )
        })
        if (!identity) return null
        return {
          ...identity,
          user: users.find((user) => user.id === identity.userId),
        }
      },
      create: async ({ data }) => {
        const identity = { id: `id-${identities.length + 1}`, ...data }
        identities.push(identity)
        return identity
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
      updateMany: async ({ where, data }) => {
        const matches = sessions.filter((session) => {
          return session.tokenHash === where.tokenHash && session.revokedAt === where.revokedAt
        })
        matches.forEach((session) => Object.assign(session, data))
        return { count: matches.length }
      },
    },
  }
}

describe('oauth auth api', () => {
  it('intercambia JWT OAuth validado por sesion httpOnly usando usuario local activo', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        role: 'admin_plu_arg',
        status: 'active',
        profile: { displayName: 'Admin PLU', firstName: 'Admin', lastName: 'PLU' },
      },
    ])
    const target = listen(
      createApp({
        prisma,
        auth0JwtCheck: createAuth0Middleware({
          sub: 'auth0|abc123',
          email: 'ADMIN@PLUARG.COM',
          email_verified: true,
        }),
      }),
    )

    const login = await fetch(`${target.url}/api/auth/oauth/session`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    const body = await login.json()
    const cookie = sessionCookie(login)

    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')
    expect(cookie).toMatch(/^plu_session=/)
    expect(body.user).toEqual({
      id: 'usr-1',
      email: 'admin@pluarg.com',
      name: 'Admin PLU',
      role: 'admin_plu_arg',
      roleKey: 'admin_plu_arg',
      roleLabel: null,
      permissions: expect.arrayContaining([
        'admin.dashboard.read',
        'admin.users.write',
        'admin.roles.read',
      ]),
      status: 'active',
      mustChangePassword: false,
      eventId: null,
      eventSlug: null,
      // Zona de seguridad del evento: nula en cuentas de staff.
      securityZoneId: null,
      // El puesto de seguridad (nombre y alcance) viaja con la sesión: sin
      // él, quien escanea en la puerta no sabe a qué sector está habilitado.
      securityZone: null,
      lastLoginAt: null,
    })

    const me = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })
    expect(me.status).toBe(200)

    await target.close()
  })

  it('rechaza usuarios OAuth no provisionados o inactivos', async () => {
    const prisma = createPrismaDouble([])
    const target = listen(
      createApp({
        prisma,
        auth0JwtCheck: createAuth0Middleware({
          sub: 'auth0|abc123',
          email: 'externo@example.com',
          email_verified: true,
        }),
      }),
    )

    const response = await fetch(`${target.url}/api/auth/oauth/session`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Usuario OAuth no habilitado.' })

    await target.close()
  })
})
