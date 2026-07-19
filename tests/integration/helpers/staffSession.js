import { hashPassword } from '../../../server/services/passwordService.js'

/**
 * staffSession.js — helpers de integración
 *
 * La sesión de staff (cookie plu_session) se valida contra Prisma, no
 * contra Supabase (ver server/services/sessionService.js) -- así que un
 * test de integración que solo necesita ejercitar endpoints staff-only
 * NO tiene por qué levantar el Postgres de docker-compose. Alcanza con
 * un doble en memoria de los modelos `user`/`session` de Prisma (mismo
 * patrón que ya usan tests/api.auth.test.js y tests/api.oauth.test.js),
 * pasado como `deps.prisma` a `createApp()` mientras `deps.supabaseAdmin`
 * es el cliente real de Supabase local.
 */
export function createPrismaDouble(users, { events = [] } = {}) {
  const sessions = []
  let userSeq = users.length

  return {
    event: {
      findUnique: async ({ where }) => events.find((event) => event.id === where.id) ?? null,
    },
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((user) => user.email === where.email) ?? null
        return users.find((user) => user.id === where.id) ?? null
      },
      findMany: async ({ where }) => {
        const emailFilter = where?.email?.in
        return users.filter((user) => {
          if (where?.role && user.role !== where.role) return false
          if (where?.eventId && user.eventId !== where.eventId) return false
          if (emailFilter && !emailFilter.includes(user.email)) return false
          return true
        })
      },
      create: async ({ data }) => {
        if (users.some((user) => user.email === data.email)) {
          // Emula la unique-violation de Prisma (P2002) para ejercitar el
          // camino de "skip por email tomado" en el alta masiva.
          const error = new Error('Unique constraint failed')
          error.code = 'P2002'
          throw error
        }
        userSeq += 1
        const event = events.find((item) => item.id === data.eventId) ?? null
        const created = {
          id: `usr-bulk-${userSeq}`,
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          status: data.status,
          eventId: data.eventId ?? null,
          profile: data.profile?.create
            ? { firstName: data.profile.create.firstName, lastName: data.profile.create.lastName }
            : null,
          event,
        }
        users.push(created)
        return created
      },
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
      },
      updateMany: async ({ where, data }) => {
        const matches = users.filter((user) => {
          if (where.role && user.role !== where.role) return false
          if (where.eventId && user.eventId !== where.eventId) return false
          if (where.status && user.status !== where.status) return false
          return true
        })
        matches.forEach((user) => Object.assign(user, data))
        return { count: matches.length }
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

export function authHeaders(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

const STAFF_TEST_PASSWORD = 'integration-test-password'

/**
 * Arma un usuario de staff de prueba (rol configurable, default
 * 'admin_maximal' -- satisface todas las guardas de rol del sistema) listo
 * para pasar a `createPrismaDouble([...])`. El caller es responsable de
 * construir `createApp({ prisma: createPrismaDouble([staffUser]), ... })`
 * ANTES de loguear, para que `loginStaff` autentique contra esa misma
 * instancia en memoria.
 */
export async function buildStaffUser({
  role = 'admin_maximal',
  email = 'staff-integration@pluarg.test',
  eventId = null,
  eventSlug = null,
} = {}) {
  return {
    id: `usr-${role}`,
    email,
    passwordHash: await hashPassword(STAFF_TEST_PASSWORD),
    role,
    status: 'active',
    profile: null,
    eventId,
    event: eventId ? { id: eventId, slug: eventSlug } : null,
  }
}

/** Loguea contra un server ya corriendo y devuelve la cookie de sesión. */
export async function loginStaff(baseUrl, { email, eventSlug } = {}) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD, eventSlug }),
  })

  if (!response.ok) {
    throw new Error(`No se pudo loguear el staff de prueba: ${response.status} ${await response.text()}`)
  }

  return { cookie: sessionCookie(response) }
}
