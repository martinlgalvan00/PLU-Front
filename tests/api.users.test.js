import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'

const ENV = { AUTH_SECRET: 'test-secret-alta-de-staff-plu', APP_URL: 'http://localhost:5173' }
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

// Doble de Prisma con lo justo para /api/auth/login (sesión) y /api/users.
function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
  const sessions = []
  let seq = users.length
  return {
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
          eventId: data.eventId ?? null,
          eventSlug: data.eventSlug ?? null,
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

async function buildAdmin(role = 'admin_plu_arg') {
  return {
    id: 'usr-admin',
    email: 'admin@pluarg.test',
    passwordHash: await hashPassword(ADMIN_PASSWORD),
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

describe('alta de staff (/api/users)', () => {
  it('un admin crea una cuenta de operador sin contraseña (invitación Auth0)', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ name: 'Nueva Operadora', email: 'op@pluarg.test', role: 'operador_plu_arg' }),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.user).toMatchObject({ email: 'op@pluarg.test', role: 'operador_plu_arg', status: 'active' })
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) crear un admin_maximal desde el endpoint (reservado al seed)', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal')])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ name: 'Otro Max', email: 'max2@pluarg.test', role: 'admin_maximal' }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('rechaza (409) un email ya existente', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ name: 'Admin Repetido', email: 'admin@pluarg.test', role: 'admin_plu_arg' }),
      })

      expect(response.status).toBe(409)
    } finally {
      await target.close()
    }
  })

  it('bloquea (401) la creación sin sesión', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Sin Sesion', email: 'nadie@pluarg.test', role: 'operador_plu_arg' }),
      })

      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
