import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'

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

function createPrismaDouble(users) {
  const sessions = []

  return {
    user: {
      findUnique: async ({ where }) => users.find((user) => user.email === where.email) ?? null,
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
        return {
          ...session,
          user: users.find((user) => user.id === session.userId),
        }
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

function authHeaders(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

describe('auth api', () => {
  it('inicia sesion con cookie httpOnly y permite consultar /me', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        role: 'admin_plu_arg',
        status: 'active',
        profile: { displayName: 'Admin PLU', firstName: 'Admin', lastName: 'PLU' },
      },
    ])
    const target = listen(createApp({ prisma }))

    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: ' ADMIN@PLUARG.COM ', password: 'clave-segura-123' }),
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
      status: 'active',
      eventId: null,
      eventSlug: null,
      lastLoginAt: expect.any(String),
    })

    const me = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })

    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ user: body.user })

    await target.close()
  })

  it('rechaza credenciales invalidas y usuarios no activos con mensaje generico', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        role: 'admin_plu_arg',
        status: 'disabled',
        profile: { displayName: 'Admin PLU', firstName: 'Admin', lastName: 'PLU' },
      },
    ])
    const target = listen(createApp({ prisma }))

    const response = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: 'admin@pluarg.com', password: 'clave-segura-123' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Credenciales invalidas.' })

    await target.close()
  })

  it('cierra sesion y revoca el acceso posterior', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        role: 'admin_plu_arg',
        status: 'active',
        profile: { displayName: 'Admin PLU', firstName: 'Admin', lastName: 'PLU' },
      },
    ])
    const target = listen(createApp({ prisma }))

    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: 'admin@pluarg.com', password: 'clave-segura-123' }),
    })
    const cookie = sessionCookie(login)

    const logout = await fetch(`${target.url}/api/auth/logout`, {
      method: 'POST',
      headers: authHeaders(cookie),
    })

    expect(logout.status).toBe(204)

    const me = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })

    expect(me.status).toBe(401)

    await target.close()
  })
})
