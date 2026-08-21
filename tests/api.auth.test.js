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
      // Se filtra por los campos que el `where` trae, no por `tokenHash` fijo:
      // `revokeSession` revoca por token y `revokeSessionsForUser` por usuario.
      // Con la versión anterior el segundo no encontraba nada (comparaba
      // `tokenHash === undefined`) y un test de revocación pasaba sin haber
      // revocado.
      updateMany: async ({ where, data }) => {
        const matches = sessions.filter((session) => {
          if ('tokenHash' in where && session.tokenHash !== where.tokenHash) return false
          if ('userId' in where && session.userId !== where.userId) return false
          if ('revokedAt' in where && session.revokedAt !== where.revokedAt) return false
          return true
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

    // Soft-probe: sin sesión activa responde 200 + user null (no 401).
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ user: null })

    await target.close()
  })

  /**
   * La validación de sesión tiene caché en memoria (server/lib/sessionCache.js)
   * para no pagar una consulta por request. Estos dos casos fijan las dos mitades
   * del trato: que efectivamente ahorre la consulta, y que revocar siga cortando
   * en el acto igual que antes.
   */
  it('resuelve la sesión sin volver a la base en el segundo request', async () => {
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
    let sessionReads = 0
    const findUnique = prisma.session.findUnique
    prisma.session.findUnique = async (args) => {
      sessionReads += 1
      return findUnique(args)
    }

    const target = listen(createApp({ prisma }))
    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: 'admin@pluarg.com', password: 'clave-segura-123' }),
    })
    const cookie = sessionCookie(login)

    const first = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })
    expect(first.status).toBe(200)
    expect(sessionReads).toBe(1)

    // Tres requests más con la misma cookie: la base no se toca de nuevo.
    for (let index = 0; index < 3; index += 1) {
      const repeat = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })
      expect((await repeat.json()).user?.email).toBe('admin@pluarg.com')
    }
    expect(sessionReads).toBe(1)

    await target.close()
  })

  it('corta en el acto una sesión revocada aunque estuviera cacheada', async () => {
    const users = [
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        role: 'admin_plu_arg',
        status: 'active',
        profile: { displayName: 'Admin PLU', firstName: 'Admin', lastName: 'PLU' },
      },
    ]
    const prisma = createPrismaDouble(users)
    const target = listen(createApp({ prisma }))

    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: 'admin@pluarg.com', password: 'clave-segura-123' }),
    })
    const cookie = sessionCookie(login)

    // Se calienta la caché.
    expect((await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })).status).toBe(
      200,
    )

    // Suspensión: es el camino que corre users.js al dar de baja o cambiar el
    // rol. Sin la purga, la sesión seguiría resolviéndose desde memoria con la
    // matriz de permisos vieja hasta que venciera el TTL.
    const { revokeSessionsForUser } = await import('../server/services/sessionService.js')
    await revokeSessionsForUser({ prisma, userId: 'usr-1' })

    const after = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })
    expect(after.status).toBe(200)
    expect(await after.json()).toEqual({ user: null })

    await target.close()
  })
})
