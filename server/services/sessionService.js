import { createHash, randomBytes } from 'node:crypto'
import { getDefaultPermissionsForRole } from '../../src/lib/permissions.js'
import { ACCESS_ROLE_INCLUDE, permissionKeysFromAccessRole } from './accessControlService.js'

export const SESSION_COOKIE_NAME = 'plu_session'

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function hashOptionalValue(value) {
  if (!value) return null

  return createHash('sha256').update(String(value)).digest('hex')
}

function secureCookieEnabled(env = process.env) {
  if (env.SESSION_COOKIE_SECURE === 'true') return true
  if (env.SESSION_COOKIE_SECURE === 'false') return false

  return env.NODE_ENV === 'production'
}

export function getSessionCookieOptions(env = process.env) {
  return {
    httpOnly: true,
    // 'strict' y no 'lax': esta cookie abre el panel operativo, y con 'lax'
    // viaja en cualquier navegación top-level entrante (un link en un mail, un
    // posteo), que es la ventana que aprovecha un CSRF por navegación.
    //
    // No rompe el acceso por link porque el frontend es una SPA: la navegación
    // inicial solo trae index.html -- no necesita la cookie -- y el `fetch` de
    // /api/auth/me que corre después ya es same-site y sí la manda.
    sameSite: 'strict',
    secure: secureCookieEnabled(env),
    path: '/',
    maxAge: SESSION_DURATION_MS,
  }
}

export function getClearSessionCookieOptions(env = process.env) {
  const options = getSessionCookieOptions(env)
  delete options.maxAge
  return options
}

export async function createSession({ prisma, userId, req, now = new Date() }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      userAgent: req.get('user-agent') ?? null,
      ipHash: hashOptionalValue(req.ip),
      expiresAt,
      revokedAt: null,
    },
  })

  return { token, expiresAt }
}

export function serializeUser(user) {
  const profileName =
    user.profile?.displayName ??
    [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ').trim()

  const roleKey = user.accessRole?.key ?? user.role
  const permissions =
    permissionKeysFromAccessRole(user.accessRole) ?? getDefaultPermissionsForRole(roleKey)

  return {
    id: user.id,
    email: user.email,
    name: profileName || user.email,
    role: user.role,
    roleKey,
    roleLabel: user.accessRole?.name ?? null,
    permissions,
    status: user.status,
    // Entró con una credencial temporal y todavía no eligió una propia. El
    // frontend la usa para forzar la pantalla de cambio; el corte real lo hace
    // `requireAuth` del lado del servidor.
    mustChangePassword: Boolean(user.mustChangePassword),
    eventId: user.eventId ?? null,
    eventSlug: user.eventSlug ?? null,
    // Zona del meet a la que está asignada la cuenta de seguridad. El panel la
    // usa para agrupar el equipo por zona; nulo mientras nadie la asignó.
    securityZoneId: user.securityZoneId ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
  }
}

export async function readSession({ prisma, token, now = new Date() }) {
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          profile: true,
          accessRole: { include: ACCESS_ROLE_INCLUDE },
        },
      },
    },
  })

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.user?.status !== 'active' ||
    session.user?.accessRole?.active === false
  ) {
    return null
  }

  return {
    session,
    user: serializeUser(session.user),
  }
}

export async function readSessionFromRequest({ prisma, req }) {
  return readSession({ prisma, token: req.cookies?.[SESSION_COOKIE_NAME] })
}

export async function revokeSession({ prisma, token, now = new Date() }) {
  if (!token) return

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: now },
  })
}

/**
 * Corta todas las sesiones abiertas de un usuario. Se usa al cambiarle el rol:
 * los permisos se resuelven al leer la sesión, así que sin esto el usuario
 * sigue operando con la matriz vieja hasta que su cookie venza -- hasta 8 horas
 * de más para alguien a quien justamente se le acaban de recortar permisos.
 */
export async function revokeSessionsForUser({ prisma, userId, now = new Date() }) {
  if (!userId || typeof prisma.session?.updateMany !== 'function') return 0

  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  })

  return result?.count ?? 0
}
