import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ENV = { AUTH_SECRET: 'test-secret-profile-notices-plu', APP_URL: 'http://localhost:5173' }
const ADMIN_PASSWORD = 'clave-admin-123'
const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const COMPLETE_ATHLETE_ID = '22222222-2222-4222-8222-222222222222'
const NOTICE_ID = '33333333-3333-4333-8333-333333333333'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function authHeaders(cookie) {
  return {
    ...mutationHeaders,
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
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

async function buildAdmin() {
  return {
    id: 'usr-admin',
    email: 'admin@pluarg.test',
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role: 'admin_maximal',
    status: 'active',
    profile: { firstName: 'Admin', lastName: 'PLU' },
    eventId: null,
    eventSlug: null,
  }
}

async function loginAdmin(url) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: mutationHeaders,
    body: JSON.stringify({ email: 'admin@pluarg.test', password: ADMIN_PASSWORD }),
  })
  return response.headers.get('set-cookie')?.split(';')[0]
}

function incompleteRow(id = ATHLETE_ID) {
  return {
    id,
    phone: '',
    city: '',
    province: '',
    gym: '',
    division: '',
    category: '',
    estimated_weight: null,
  }
}

function completeRow(id = COMPLETE_ATHLETE_ID) {
  return {
    id,
    phone: '1155551234',
    city: 'Banfield',
    province: 'Buenos Aires',
    gym: 'Maximal',
    division: 'Open',
    category: 'Raw',
    estimated_weight: 90,
  }
}

function createNoticeRepo() {
  const notices = new Map()
  const upserts = []
  return {
    upserts,
    notices,
    findProfileCompleteness: async (athleteId) => {
      if (athleteId === COMPLETE_ATHLETE_ID) return completeRow()
      if (athleteId === ATHLETE_ID) return incompleteRow()
      return null
    },
    findProfileCompletenessMany: async (athleteIds) =>
      athleteIds
        .map((athleteId) => {
          if (athleteId === COMPLETE_ATHLETE_ID) return completeRow()
          if (athleteId === ATHLETE_ID) return incompleteRow()
          return null
        })
        .filter(Boolean),
    upsertProfileNotice: async (payload) => {
      upserts.push(payload)
      const notice = {
        id: NOTICE_ID,
        athlete_id: payload.athleteId,
        kind: 'profile_incomplete',
        missing_fields: payload.missingFields,
        message: payload.message,
        created_by: payload.createdBy,
        created_at: '2026-09-08T12:00:00.000Z',
        read_at: null,
        dismissed_at: null,
        resolved_at: null,
      }
      notices.set(payload.athleteId, notice)
      return notice
    },
    listOpenProfileNotices: async (athleteId) => {
      const notice = notices.get(athleteId)
      return notice && !notice.resolved_at ? [notice] : []
    },
    markProfileNotice: async (noticeId, athleteId, flags = {}) => {
      const notice = notices.get(athleteId)
      if (!notice || notice.id !== noticeId) {
        const error = new Error('Aviso no encontrado.')
        error.status = 404
        throw error
      }
      if (flags.read) notice.read_at = '2026-09-08T13:00:00.000Z'
      if (flags.dismissed) notice.dismissed_at = '2026-09-08T13:00:00.000Z'
      return notice
    },
    resolveOpenProfileNotices: async (athleteId) => {
      const notice = notices.get(athleteId)
      if (notice) notice.resolved_at = '2026-09-08T14:00:00.000Z'
    },
    update: async (athleteId, patch) => ({
      id: athleteId,
      email: patch.email,
      phone: patch.phone,
      city: patch.city,
      province: patch.province,
      gym: patch.gym,
      division: patch.division,
      category: patch.category,
      estimated_weight: patch.estimatedWeight,
    }),
    snapshotRevision: async () => '1',
    snapshot: async (athleteId) => ({
      athlete: {
        id: athleteId,
        full_name: 'Agus Test',
        email: 'agus@plu.test',
      },
      memberships: [],
      registrations: [],
      paymentOrders: [],
    }),
  }
}

function supabaseForAthlete() {
  return {
    from: vi.fn((table) => {
      if (table === 'athlete_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'session-1',
                  athlete_id: ATHLETE_ID,
                  expires_at: '2099-01-01T00:00:00Z',
                  revoked_at: null,
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => ({}) }),
        }
      }
      throw new Error(`Tabla inesperada: ${table}`)
    }),
  }
}

describe('API avisos de perfil incompleto', () => {
  it('el admin envía un aviso con el snapshot de campos faltantes', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const athleteRepository = createNoticeRepo()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(
        `${target.url}/api/athletes/admin/${ATHLETE_ID}/profile-notices`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ message: 'Falta el teléfono' }),
        },
      )
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.missing).toContain('phone')
      expect(body.notice.athlete_id).toBe(ATHLETE_ID)
      expect(body.notice.message).toBe('Falta el teléfono')
      expect(athleteRepository.upserts[0].createdBy).toBe('usr-admin:admin@pluarg.test')
    } finally {
      await target.close()
    }
  })

  it('rechaza avisar a un perfil ya completo', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, athleteRepository: createNoticeRepo(), env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(
        `${target.url}/api/athletes/admin/${COMPLETE_ATHLETE_ID}/profile-notices`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: '{}',
        },
      )
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body.code).toBe('PROFILE_COMPLETE')
    } finally {
      await target.close()
    }
  })

  it('en bulk saltea perfiles completos', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, athleteRepository: createNoticeRepo(), env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/athletes/admin/profile-notices/bulk`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ athleteIds: [ATHLETE_ID, COMPLETE_ATHLETE_ID] }),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.sent).toHaveLength(1)
      expect(body.sent[0].athleteId).toBe(ATHLETE_ID)
      expect(body.skipped).toEqual([{ athleteId: COMPLETE_ATHLETE_ID, reason: 'complete' }])
    } finally {
      await target.close()
    }
  })

  it('el atleta lee, descarta y el aviso se resuelve al guardar el perfil completo', async () => {
    const athleteRepository = createNoticeRepo()
    athleteRepository.notices.set(ATHLETE_ID, {
      id: NOTICE_ID,
      athlete_id: ATHLETE_ID,
      kind: 'profile_incomplete',
      missing_fields: ['phone'],
      message: null,
      created_at: '2026-09-08T12:00:00.000Z',
      read_at: null,
      dismissed_at: null,
      resolved_at: null,
    })
    const target = listen(
      createApp({
        env: ENV,
        supabaseAdmin: supabaseForAthlete(),
        athleteRepository,
      }),
    )

    try {
      const athleteHeaders = {
        ...mutationHeaders,
        Cookie: 'plu_athlete_session=test-session-token',
      }

      const session = await fetch(`${target.url}/api/athletes/session`, {
        headers: athleteHeaders,
      })
      const sessionBody = await session.json()
      expect(session.status).toBe(200)
      expect(sessionBody.athlete.profile_notices[0].id).toBe(NOTICE_ID)

      const read = await fetch(`${target.url}/api/athletes/me/profile-notices/${NOTICE_ID}/read`, {
        method: 'POST',
        headers: athleteHeaders,
        body: '{}',
      })
      expect(read.status).toBe(200)
      expect((await read.json()).notice.read_at).toBeTruthy()

      const dismiss = await fetch(
        `${target.url}/api/athletes/me/profile-notices/${NOTICE_ID}/dismiss`,
        {
          method: 'POST',
          headers: athleteHeaders,
          body: '{}',
        },
      )
      expect(dismiss.status).toBe(200)
      expect((await dismiss.json()).notice.dismissed_at).toBeTruthy()

      const saved = await fetch(`${target.url}/api/athletes/me`, {
        method: 'PATCH',
        headers: athleteHeaders,
        body: JSON.stringify({
          email: 'agus@plu.test',
          phone: '1155551234',
          city: 'Banfield',
          province: 'Buenos Aires',
          gym: 'Maximal',
          division: 'Open',
          category: 'Raw',
          estimatedWeight: 90,
          instagramHandle: '',
          emergencyContactName: '',
          emergencyContactPhone: '',
        }),
      })
      const savedBody = await saved.json()
      expect(saved.status).toBe(200)
      expect(savedBody.athlete.profile_notices).toEqual([])
      expect(athleteRepository.notices.get(ATHLETE_ID).resolved_at).toBeTruthy()
    } finally {
      await target.close()
    }
  })
})
