import { createHash, randomBytes } from 'node:crypto'
import { getDefaultPermissionsForRole } from '../../src/lib/permissions.js'
import { staffSessionCache } from '../lib/sessionCache.js'
import { ACCESS_ROLE_INCLUDE, permissionKeysFromAccessRole } from './accessControlService.js'

export const SESSION_COOKIE_NAME = 'plu_session'

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8
/**
 * Tope absoluto de una sesión staff desde su creación. La duración de 8 h es
 * un timeout de inactividad que se renueva con el uso (ver
 * `extendSessionIfActive`); sin un tope absoluto, una sesión que nunca duerme
 * sería infinita, y la contraseña cambiada o el rol recortado deben poder
 * vencer solos aunque la persona siga activa.
 */
const SESSION_ABSOLUTE_MS = 1000 * 60 * 60 * 24 * 7

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

/**
 * Renovación deslizante de la sesión staff: mientras haya actividad, la
 * ventana de 8 h se corre hacia adelante. Sin esto, el panel cerraba la
 * sesión a mitad de una acreditación sólo porque pasaron 8 h desde el login,
 * aunque la persona no hubiera dejado de usarlo ni un minuto.
 *
 * Reglas que la mantienen siendo una decisión de seguridad y no una sesión
 * eterna:
 *
 * - Sólo escribe pasada la mitad de la ventana: a lo sumo un UPDATE cada 4 h
 *   por sesión activa, no uno por request.
 * - El tope absoluto (`SESSION_ABSOLUTE_MS`, 7 días desde la creación) manda
 *   sobre la renovación: pasado ese límite hay que volver a hacer login, y el
 *   cambio de contraseña o el recorte de permisos siguen cortando por
 *   revocación como siempre.
 * - Es best-effort: si el UPDATE falla, la sesión simplemente sigue con el
 *   vencimiento que ya tenía.
 */
export async function extendSessionIfActive({ prisma, result, req, res, now = new Date() }) {
  const session = result?.session
  if (!session || !req || !res || typeof prisma?.session?.update !== 'function') return null

  const nowMs = now.getTime()
  const expiresAtMs = session.expiresAt?.getTime?.() ?? 0
  if (expiresAtMs - nowMs > SESSION_DURATION_MS / 2) return null

  const createdAtMs = session.createdAt?.getTime?.() ?? expiresAtMs - SESSION_DURATION_MS
  const nextExpiresMs = Math.min(nowMs + SESSION_DURATION_MS, createdAtMs + SESSION_ABSOLUTE_MS)
  if (nextExpiresMs <= expiresAtMs) return null

  const nextExpiresAt = new Date(nextExpiresMs)
  // Primero la caché: el objeto resuelto que viaja en ella sigue cargando el
  // vencimiento viejo y el próximo request lo leería antes de tocar la base.
  staffSessionCache.invalidateKey(session.tokenHash)
  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: nextExpiresAt },
  })

  // La cookie del browser también vencía a las 8 h del login aunque la base
  // ya hubiera extendido la sesión: sin este refresh el navegador la tira y
  // el siguiente request llega anónimo.
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (token) res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions())

  return nextExpiresAt
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
    /**
     * El puesto al que está asignada la cuenta, con nombre y alcance.
     *
     * Con sólo el id, quien escanea en la puerta no tenía forma de saber a qué
     * sector está habilitado: leía un QR y o entraba o no, sin poder anticipar
     * cuál. El alcance es además lo que la RPC de canje usa para decidir qué
     * credencial abre ese puesto, así que mostrarlo es mostrar la regla real,
     * no una etiqueta decorativa.
     */
    securityZone: user.securityZone
      ? {
          id: user.securityZone.id,
          name: user.securityZone.name,
          scope: user.securityZone.scope,
        }
      : null,
    lastLoginAt: user.lastLoginAt ?? null,
  }
}

export async function readSession({ prisma, token, now = new Date() }) {
  if (!token) return null

  const tokenHash = hashToken(token)
  // La resolución de la sesión es idéntica request a request mientras nada la
  // revoque, y revocar pasa siempre por `revokeSession`/`revokeSessionsForUser`,
  // que purgan esta caché. Ver server/lib/sessionCache.js para por qué es
  // seguro cachear una decisión de autorización acá.
  const cached = staffSessionCache.get(tokenHash, now.getTime())
  if (cached) return cached

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          profile: true,
          accessRole: { include: ACCESS_ROLE_INCLUDE },
          // Va en la misma consulta que ya resuelve la sesión: es un join más,
          // no un request extra por cada escaneo.
          securityZone: { select: { id: true, name: true, scope: true } },
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

  const resolved = {
    session,
    user: serializeUser(session.user),
  }
  // Sólo el resultado positivo: una cookie revocada tiene que volver a
  // consultarse en vez de quedar clavada en "no" por lo que dure el TTL.
  staffSessionCache.set(tokenHash, resolved, { ownerKey: session.userId, now: now.getTime() })
  return resolved
}

export async function readSessionFromRequest({ prisma, req }) {
  return readSession({ prisma, token: req.cookies?.[SESSION_COOKIE_NAME] })
}

export async function revokeSession({ prisma, token, now = new Date() }) {
  if (!token) return

  const tokenHash = hashToken(token)
  // Antes de la base, no después: si el update falla, la caché ya no tiene la
  // sesión y el próximo request la relee. Al revés, un fallo dejaría la sesión
  // viva en memoria durante todo el TTL después de un logout que el usuario ya
  // vio confirmado.
  staffSessionCache.invalidateKey(tokenHash)

  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
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
  if (!userId) return 0
  // La purga corre incluso si el doble de test no trae `session.updateMany`:
  // este llamado es el punto donde un recorte de permisos tiene que empezar a
  // valer, y saltearlo dejaría la matriz vieja viva en memoria.
  staffSessionCache.invalidateOwner(userId)
  if (typeof prisma.session?.updateMany !== 'function') return 0

  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  })

  return result?.count ?? 0
}
