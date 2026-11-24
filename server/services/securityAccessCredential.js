import { buildSecurityGatePath } from '../../src/lib/securityGateRoute.js'
import { generateGateCode, normalizeGateCode } from '../../src/lib/ticketGateCode.js'
import { HttpError } from '../lib/errors.js'
import { createAccessToken } from './securityAccessToken.js'

// Vigencia de una credencial de acceso de puerta. Si el evento tiene fin
// conocido, la credencial dura hasta 7 días después (margen operativo);
// si no, un default de 30 días.
const ACCESS_LINK_POST_EVENT_MS = 1000 * 60 * 60 * 24 * 7
const ACCESS_LINK_DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30
const CODE_ATTEMPTS = 8

export function resolveAccessLinkExpiry(event, requestedExpiresAt = null, now = new Date()) {
  const eventEnd = event?.endsAt ? new Date(event.endsAt) : null
  const latestAllowed =
    eventEnd && !Number.isNaN(eventEnd.getTime()) && eventEnd > now
      ? new Date(eventEnd.getTime() + ACCESS_LINK_POST_EVENT_MS)
      : new Date(now.getTime() + ACCESS_LINK_DEFAULT_TTL_MS)

  if (!requestedExpiresAt) return latestAllowed

  const requested = new Date(requestedExpiresAt)
  if (Number.isNaN(requested.getTime()) || requested <= now) {
    throw new HttpError(400, 'El vencimiento de la credencial debe ser futuro.')
  }
  if (requested > latestAllowed) {
    throw new HttpError(400, 'El vencimiento supera la ventana segura del evento.')
  }
  return requested
}

export function buildSecurityAccessUrl(appUrl, eventSlug, code) {
  const base = String(appUrl || '').replace(/\/$/, '')
  return `${base}${buildSecurityGatePath(eventSlug)}?c=${encodeURIComponent(code)}`
}

/**
 * La credencial guardada, o null si esta cuenta nunca tuvo una.
 * `expired` no la esconde: el panel tiene que poder mostrar el vencimiento.
 */
export function readStoredSecurityAccess(user, { appUrl, now = new Date() } = {}) {
  const code = normalizeGateCode(user?.securityAccessCode)
  const expiresAt = user?.securityAccessExpiresAt ? new Date(user.securityAccessExpiresAt) : null
  if (!code || !expiresAt || Number.isNaN(expiresAt.getTime()) || !user?.eventSlug) return null
  const version = Number(user.securityAccessVersion) || 0
  return {
    code,
    expiresAt,
    version,
    expired: expiresAt.getTime() <= now.getTime(),
    url: buildSecurityAccessUrl(appUrl, user.eventSlug, code),
  }
}

export function isStoredAccessCurrent(user, now = new Date()) {
  const stored = readStoredSecurityAccess(user, { now })
  return Boolean(stored && !stored.expired)
}

export async function findSecurityUserByDoorCode(prisma, { code, eventSlug, include }) {
  const normalized = normalizeGateCode(code)
  if (!normalized || !eventSlug) return null
  return prisma.user.findFirst({
    where: {
      role: 'seguridad_plu_arg',
      eventSlug,
      securityAccessCode: normalized,
    },
    include,
  })
}

async function allocateCode(prisma, eventId, userId, random) {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = generateGateCode(random)
    const clash = await prisma.user.findFirst({
      where: { eventId, securityAccessCode: code },
    })
    if (!clash || clash.id === userId) return code
  }
  throw new HttpError(503, 'No se pudo emitir un código de puerta único.')
}

/**
 * Devuelve la credencial vigente. Solo rota (código nuevo + versión) cuando
 * `rotate` es true, o cuando no hay una vigente: la primera emisión no es
 * una rotación de un link que ya estaba guardado.
 */
export async function ensureSecurityAccess({
  prisma,
  user,
  event,
  appUrl,
  requestedExpiresAt = null,
  rotate = false,
  now = new Date(),
  random,
  secret,
}) {
  const current = readStoredSecurityAccess(user, { appUrl, now })
  // Aunque esté vencida, sin `rotate` se devuelve la misma: el mail y el modal
  // no pueden mostrar un código distinto del que acaba de salir.
  if (current && !rotate) {
    return {
      ...current,
      token: createAccessToken({
        userId: user.id,
        eventId: user.eventId,
        expiresAt: current.expiresAt,
        version: current.version,
        secret,
      }),
    }
  }

  const expiresAt = resolveAccessLinkExpiry(event, requestedExpiresAt, now)
  const nextVersion = (Number(user.securityAccessVersion) || 0) + 1
  const code = await allocateCode(prisma, user.eventId, user.id, random)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      securityAccessCode: code,
      securityAccessExpiresAt: expiresAt,
      securityAccessVersion: nextVersion,
    },
  })
  user.securityAccessCode = code
  user.securityAccessExpiresAt = expiresAt
  user.securityAccessVersion = nextVersion

  return {
    code,
    expiresAt,
    version: nextVersion,
    expired: false,
    url: buildSecurityAccessUrl(appUrl, user.eventSlug, code),
    token: createAccessToken({
      userId: user.id,
      eventId: user.eventId,
      expiresAt,
      version: nextVersion,
      secret,
    }),
  }
}
