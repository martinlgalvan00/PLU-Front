import { HttpError } from './errors.js'

/**
 * Alcance por evento de una cuenta de rol "por evento" (organizador).
 *
 * Diseño: DENEGAR POR DEFECTO. `requireAuth` le corta a una cuenta por evento
 * cualquier ruta que no haya declarado `eventScoped: true`, así que una ruta
 * nueva nace cerrada para el organizador sin que nadie tenga que acordarse. Las
 * rutas que sí lo habilitan están obligadas a filtrar con estas funciones: el
 * test de contrato (tests/api.eventScopeContract.test.js) recorre TODAS las rutas
 * y falla si una queda abierta sin estar en su lista revisada.
 *
 * `null` = sin restricción (Super Admin, Administrador y el resto de las cuentas
 * actuales): el alcance por evento no les cambia nada.
 */
export function eventScopeOf(req) {
  const user = req?.auth?.user
  if (!user?.eventScoped) return null
  const access = Array.isArray(user.eventAccess) ? user.eventAccess : []
  return {
    access,
    eventIds: new Set(access.map((grant) => grant.eventId).filter(Boolean)),
    slugs: new Set(access.map((grant) => grant.eventSlug).filter(Boolean)),
  }
}

export function isEventScoped(req) {
  return eventScopeOf(req) !== null
}

/**
 * ¿La cuenta puede operar sobre este evento?
 *
 * Si el pedido trae id Y slug, tienen que ser del MISMO evento asignado: aceptar
 * "uno u otro" dejaría mandar el slug de un evento propio con el id de uno ajeno
 * y que un campo avale al otro.
 */
export function canAccessEvent(req, { eventId = null, slug = null } = {}) {
  const scope = eventScopeOf(req)
  if (!scope) return true
  if (!eventId && !slug) return false
  return scope.access.some(
    (grant) =>
      (eventId ? grant.eventId === eventId : true) && (slug ? grant.eventSlug === slug : true),
  )
}

export function assertEventAccess(req, target) {
  if (canAccessEvent(req, target)) return
  throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.', {
    code: 'event_scope_denied',
  })
}

/** Slugs de los eventos que la cuenta puede ver, o `null` si no tiene restricción. */
export function scopedEventSlugs(req) {
  const scope = eventScopeOf(req)
  return scope ? [...scope.slugs] : null
}

export function scopedEventIds(req) {
  const scope = eventScopeOf(req)
  return scope ? [...scope.eventIds] : null
}
