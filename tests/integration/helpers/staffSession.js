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
export function createPrismaDouble(users) {
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
