import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { HttpError } from '../server/lib/errors.js'
import { hashPassword } from '../server/services/passwordService.js'

const ENV = { AUTH_SECRET: 'test-secret-borrado-atletas-plu', APP_URL: 'http://localhost:5173' }
const ADMIN_PASSWORD = 'clave-admin-123'
const ATHLETE_ID = '5f3b2f6e-7a1c-4b2d-9e8f-1a2b3c4d5e6f'
const MISSING_ATHLETE_ID = '00000000-0000-4000-8000-000000000099'

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

// Doble de Prisma con lo justo para /api/auth/login y requireAuth (sesión).
function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
  const sessions = []
  const prisma = {
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
  prisma._state = { users }
  return prisma
}

// Doble del repositorio de atletas: solo el borrado, que es lo que ejerce el
// endpoint. Registra las llamadas para verificar id y actor.
function createAthleteRepoDouble() {
  const calls = []
  return {
    calls,
    adminData: async () => ({
      athletes: [{ id: ATHLETE_ID, full_name: 'Atleta visible' }],
      memberships: [],
      registrations: [],
      paymentOrders: [{ id: 'pay-sensitive', amount: 75000 }],
    }),
    deleteAthlete: async (athleteId, actor) => {
      calls.push({ athleteId, actor })
      if (athleteId === MISSING_ATHLETE_ID) {
        throw new HttpError(404, 'Atleta no encontrado.')
      }
      return {
        id: athleteId,
        removed: { checkIns: 0, memberships: 1, registrations: 1, paymentOrders: 1 },
      }
    },
  }
}

async function buildAdmin(role = 'admin_maximal') {
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

describe('borrado de atletas (DELETE /api/athletes/admin/:athleteId)', () => {
  it('un Super Admin elimina un atleta y el actor queda registrado para la auditoría', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/athletes/admin/${ATHLETE_ID}`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.deletedAthlete.id).toBe(ATHLETE_ID)
      // El actor viaja como `id:email`: es lo que la RPC asienta en
      // domain_audit_logs sin depender de que el usuario siga existiendo.
      expect(athleteRepository.calls).toEqual([
        { athleteId: ATHLETE_ID, actor: 'usr-admin:admin@pluarg.test' },
      ])
    } finally {
      await target.close()
    }
  })

  it('rechaza (403) a un Administrador aunque gestione atletas', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_plu_arg')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/athletes/admin/${ATHLETE_ID}`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(403)
      expect(athleteRepository.calls).toHaveLength(0)
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) un id que no es uuid', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/athletes/admin/no-es-uuid`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(400)
      expect(athleteRepository.calls).toHaveLength(0)
    } finally {
      await target.close()
    }
  })

  it('devuelve 404 cuando el atleta no existe', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/athletes/admin/${MISSING_ATHLETE_ID}`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(404)
    } finally {
      await target.close()
    }
  })

  it('sin sesión de staff responde 401', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const response = await fetch(`${target.url}/api/athletes/admin/${ATHLETE_ID}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })

      expect(response.status).toBe(401)
      expect(athleteRepository.calls).toHaveLength(0)
    } finally {
      await target.close()
    }
  })
})

describe('lectura segmentada del padrón (GET /api/athletes/admin)', () => {
  it('no expone órdenes si el rol puede ver el dashboard pero no pagos', async () => {
    const user = await buildAdmin('operador_plu_arg')
    user.accessRole = { key: 'plu_arg', name: 'PLU' }
    const prisma = createPrismaDouble([user])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/athletes/admin`, {
        headers: authHeaders(cookie),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.athletes).toHaveLength(1)
      expect(body.paymentOrders).toEqual([])
      expect(body).not.toHaveProperty('payments')
    } finally {
      await target.close()
    }
  })
})
