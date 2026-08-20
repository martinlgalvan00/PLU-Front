/**
 * athleteEventStatus.js — PLU ARG
 *
 * Estado personal del atleta frente a un evento del calendario público.
 *
 * Punto de verdad único de "¿esta persona está inscripta a este meet?": lo
 * consumen la cuenta (Competencias), la página del torneo, la landing y el
 * calendario público. Antes cada pantalla lo resolvía a mano — la cuenta
 * comparaba `registration.event === event.title` — y el mismo atleta aparecía
 * inscripto en una y sin inscribir en otra.
 */

import { isRegistrationAdmitted } from './status.js'
import { hasCurrentMembership } from '../services/membershipService.js'

/** Estados que ya no reservan cupo: no cuentan como inscripción vigente. */
const DEAD_REGISTRATION_STATUSES = new Set([
  'cancelada',
  'cancelled',
  'cancelado',
  'rechazado',
  'reembolsada',
  'reembolsado',
])

/** Inscripción cargada pero todavía sin acreditar el pago. */
const PENDING_REGISTRATION_STATUSES = new Set(['pendiente_pago', 'validacion_manual'])

function normalize(status) {
  return String(status ?? '').toLowerCase()
}

export function isDeadRegistration(registration) {
  return DEAD_REGISTRATION_STATUSES.has(normalize(registration?.status))
}

export function isPendingRegistration(registration) {
  return PENDING_REGISTRATION_STATUSES.has(normalize(registration?.status))
}

/**
 * ¿Esta inscripción es de este evento? El slug es la identidad real; el título
 * queda solo como respaldo para filas viejas que se guardaron sin slug. Nunca
 * al revés: el staff renombra eventos desde el panel y un match por título se
 * rompe solo, dejando al inscripto sin su estado en pantalla.
 */
export function isRegistrationForEvent(registration, event) {
  if (!registration || !event) return false
  if (registration.eventSlug && event.slug) return registration.eventSlug === event.slug
  return Boolean(registration.event) && registration.event === event.title
}

/**
 * La inscripción vigente del atleta para el evento, o null.
 *
 * Un atleta puede acumular varias filas del mismo meet (canceló y volvió a
 * inscribirse; ver `reactivate_cancelled_registration`). Ganan la confirmada,
 * después la pendiente de pago; las canceladas y rechazadas no cuentan, así
 * que quien canceló vuelve a ver el botón de inscribirse en vez de un
 * "ya estás inscripto" que le bloquea el alta.
 */
export function findAthleteEventRegistration(registrations = [], { athleteId, event } = {}) {
  if (!athleteId || !event) return null

  const mine = (Array.isArray(registrations) ? registrations : []).filter(
    (item) => item?.athleteId === athleteId && isRegistrationForEvent(item, event),
  )
  if (!mine.length) return null

  return (
    mine.find((item) => isRegistrationAdmitted(item.status)) ??
    mine.find((item) => isPendingRegistration(item)) ??
    null
  )
}

/**
 * @param {{
 *   event?: { slug?: string, title?: string, requiresMembership?: boolean, status?: string } | null
 *   session?: { role?: string, athleteId?: string } | null
 *   registrations?: Array<{ eventSlug?: string, event?: string, athleteId?: string, status?: string }>
 *   memberships?: unknown[]
 * }} input
 * @returns {'guest' | 'registered' | 'pending_payment' | 'needs_membership' | 'can_register' | 'closed' | null}
 */
export function resolveAthleteEventStatus({
  event,
  session,
  registrations = [],
  memberships = [],
} = {}) {
  if (!event?.slug) return null

  const isAthlete = session?.role === 'athlete_plu'
  const athleteId = isAthlete ? session.athleteId : null
  const registration = findAthleteEventRegistration(registrations, { athleteId, event })

  // El derecho ya adquirido se informa antes que el estado del calendario: un
  // meet que se cierra o llena no deja de tener inscriptos, y decirle
  // "inscripción cerrada" a quien ya pagó era la forma más rápida de que
  // pensara que perdió el cupo.
  if (registration) {
    if (isRegistrationAdmitted(registration.status)) return 'registered'
    if (isPendingRegistration(registration)) return 'pending_payment'
  }

  const closed =
    event.status === 'cerrado' || event.status === 'finalizado' || event.status === 'agotado'
  if (closed) return 'closed'

  if (!isAthlete) return 'guest'

  const membershipOk = hasCurrentMembership(memberships, athleteId)
  if (event.requiresMembership && !membershipOk) return 'needs_membership'

  if (event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados') {
    return 'can_register'
  }

  return null
}
