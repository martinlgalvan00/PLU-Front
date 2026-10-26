import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'
import { REGISTRATION_IMPORT_BATCH_SIZE } from '../shared/registrationSheet.js'

/*
 * POST /api/athletes/admin/registrations/import — planilla de inscripciones
 * de vuelta. La vista previa no escribe; aplicar usa las mismas operaciones
 * que la corrección de staff (RPC auditada, categoría de peso, modalidades).
 */

const ENV = { AUTH_SECRET: 'test-secret-importacion-planilla', APP_URL: 'http://localhost:5173' }
const PASSWORD = 'clave-admin-123'
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_OTHER_EVENT = '33333333-3333-4333-8333-333333333333'
const ID_MISSING = '44444444-4444-4444-8444-444444444444'

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
      findUnique: async ({ where }) =>
        users.find((user) => (where.email ? user.email === where.email : user.id === where.id)) ??
        null,
      update: async ({ where, data }) => Object.assign(users.find((u) => u.id === where.id), data),
    },
    session: {
      create: async ({ data }) => {
        const session = { id: `ses-${sessions.length + 1}`, ...data }
        sessions.push(session)
        return session
      },
      findUnique: async ({ where }) => {
        const session = sessions.find((item) => item.tokenHash === where.tokenHash)
        return session ? { ...session, user: users.find((user) => user.id === session.userId) } : null
      },
      updateMany: async () => ({ count: 0 }),
    },
  }
}

async function staffUser(role) {
  return {
    id: 'usr-staff',
    email: 'staff@pluarg.test',
    passwordHash: await hashPassword(PASSWORD),
    role,
    status: 'active',
    profile: { firstName: 'Staff', lastName: 'PLU' },
    eventId: null,
    eventSlug: null,
  }
}

const EVENT = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  roster_frozen_at: null,
  rules: { offering: { categories: ['Raw', 'Raw With Wraps'] } },
}

function createRepoDouble({ failModalitiesFor = null } = {}) {
  const calls = { correction: [], weightClass: [], modalities: [] }
  const rows = {
    [ID_A]: {
      id: ID_A,
      status: 'confirmada',
      division: 'Junior',
      secondary_division: null,
      category: 'Raw',
      modalities: ['full_power'],
      bodyweight_kg: 66,
      declared_weight_class: '67,5',
      athlete: { full_name: 'Lucía Prueba', sex: 'Femenino' },
      event: EVENT,
    },
    [ID_B]: {
      id: ID_B,
      status: 'confirmada',
      division: 'Open',
      secondary_division: null,
      category: 'Raw',
      modalities: ['full_power'],
      bodyweight_kg: 88,
      declared_weight_class: '90',
      athlete: { full_name: 'Juan Prueba', sex: 'Masculino' },
      event: EVENT,
    },
    [ID_OTHER_EVENT]: {
      id: ID_OTHER_EVENT,
      status: 'confirmada',
      division: 'Open',
      category: 'Raw',
      modalities: ['full_power'],
      bodyweight_kg: 70,
      declared_weight_class: '75',
      athlete: { full_name: 'Otra Persona', sex: 'Masculino' },
      event: { ...EVENT, id: 'evt-2', slug: 'winter-open-2026', title: 'Winter Open' },
    },
  }
  return {
    calls,
    findRegistrationImportContexts: async (ids) => ids.map((id) => rows[id]).filter(Boolean),
    correctRegistrationCompetition: async (id, data, actor) => {
      calls.correction.push({ id, data, actor })
      return { id }
    },
    updateDeclaredWeightClass: async (id, declaredWeightClass) => {
      calls.weightClass.push({ id, declaredWeightClass })
      return { id }
    },
    updateRegistrationModalities: async (id, modalities) => {
      if (id === failModalitiesFor) throw new Error('No se pudieron guardar las modalidades.')
      calls.modalities.push({ id, modalities })
      return { id, modalities }
    },
  }
}

async function withApi({ role = 'admin_maximal', repo = createRepoDouble() } = {}, run) {
  const prisma = createPrismaDouble([await staffUser(role)])
  const target = listen(createApp({ prisma, athleteRepository: repo, env: ENV }))
  try {
    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: 'staff@pluarg.test', password: PASSWORD }),
    })
    const cookie = login.headers.get('set-cookie')?.split(';')[0]
    const post = async (body) => {
      const response = await fetch(`${target.url}/api/athletes/admin/registrations/import`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.json().catch(() => null) }
    }
    await run({ post, repo })
  } finally {
    await target.close()
  }
}

const SHEET_ROWS = [
  {
    row: 2,
    registrationId: ID_A,
    values: { category: 'Raw With Wraps', modalities: ['full_power', 'bench'], bodyweightKg: 66 },
  },
  { row: 3, registrationId: ID_B, values: { declaredWeightClass: '44' } },
  { row: 4, registrationId: ID_MISSING, values: { division: 'Open' } },
]

describe('importación de la planilla de inscripciones', () => {
  it('la vista previa compara y valida sin escribir nada', async () => {
    await withApi({}, async ({ post, repo }) => {
      const { status, body } = await post({ apply: false, rows: SHEET_ROWS })

      expect(status).toBe(200)
      expect(body.summary).toMatchObject({ total: 3, changed: 1, invalid: 2, applied: 0 })
      expect(body.rows[0]).toMatchObject({
        row: 2,
        athlete: 'Lucía Prueba',
        state: 'changed',
        changes: [
          { field: 'category', from: 'Raw', to: 'Raw With Wraps' },
          { field: 'modalities', from: ['full_power'], to: ['full_power', 'bench'] },
        ],
      })
      expect(body.rows[1].errors).toEqual([
        { field: 'declaredWeightClass', code: 'WEIGHT_CLASS_INVALID', value: '44' },
      ])
      expect(body.rows[2].errors).toEqual([{ field: 'registrationId', code: 'NOT_FOUND' }])
      expect(body.rows[0]).not.toHaveProperty('next')
      expect(repo.calls).toEqual({ correction: [], weightClass: [], modalities: [] })
    })
  })

  it('aplica solo las filas válidas con la corrección auditada y las modalidades', async () => {
    await withApi({}, async ({ post, repo }) => {
      const { status, body } = await post({ apply: true, rows: SHEET_ROWS })

      expect(status).toBe(200)
      expect(body.summary).toMatchObject({ applied: 1, invalid: 2, failed: 0 })
      expect(repo.calls.correction).toEqual([
        {
          id: ID_A,
          data: { division: 'Junior', category: 'Raw With Wraps', bodyweightKg: 66 },
          actor: 'usr-staff:staff@pluarg.test',
        },
      ])
      expect(repo.calls.modalities).toEqual([{ id: ID_A, modalities: ['full_power', 'bench'] }])
      expect(repo.calls.weightClass).toEqual([])
    })
  })

  it('una fila que falla al guardar no frena al resto', async () => {
    await withApi(
      { repo: createRepoDouble({ failModalitiesFor: ID_A }) },
      async ({ post, repo }) => {
        const { body } = await post({
          apply: true,
          rows: [
            { row: 2, registrationId: ID_A, values: { modalities: ['bench'] } },
            { row: 3, registrationId: ID_B, values: { declaredWeightClass: '100' } },
          ],
        })

        expect(body.summary).toMatchObject({ applied: 1, failed: 1 })
        expect(body.rows[0]).toMatchObject({
          state: 'failed',
          message: 'No se pudieron guardar las modalidades.',
        })
        expect(repo.calls.weightClass).toEqual([{ id: ID_B, declaredWeightClass: '100' }])
      },
    )
  })

  it('desde un evento, rechaza filas de otro evento', async () => {
    await withApi({}, async ({ post }) => {
      const { body } = await post({
        apply: false,
        eventSlug: 'barbell-submission-2027',
        rows: [{ row: 2, registrationId: ID_OTHER_EVENT, values: { category: 'Raw With Wraps' } }],
      })
      expect(body.rows[0].errors).toEqual([{ field: 'registrationId', code: 'OTHER_EVENT' }])
    })
  })

  it(`acepta como máximo ${REGISTRATION_IMPORT_BATCH_SIZE} filas por request y campos conocidos`, async () => {
    await withApi({}, async ({ post }) => {
      const tooMany = Array.from({ length: REGISTRATION_IMPORT_BATCH_SIZE + 1 }, (_, index) => ({
        row: index + 2,
        registrationId: ID_A,
        values: {},
      }))
      expect((await post({ rows: tooMany })).status).toBe(400)
      expect(
        (await post({ rows: [{ row: 2, registrationId: ID_A, values: { status: 'confirmada' } }] }))
          .status,
      ).toBe(400)
    })
  })

  it('exige permiso de escritura de inscripciones', async () => {
    await withApi({ role: 'plu_arg' }, async ({ post, repo }) => {
      const { status } = await post({ apply: true, rows: SHEET_ROWS })
      expect(status).toBe(403)
      expect(repo.calls.correction).toEqual([])
    })
  })
})
