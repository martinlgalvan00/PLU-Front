/**
 * athleteEventStatus.js — PLU ARG
 *
 * Estado personal del atleta frente a un evento del calendario público.
 */

import { isRegistrationAdmitted } from './status.js'
import { hasCurrentMembership } from '../services/membershipService.js'

/**
 * @param {{
 *   event?: { slug?: string, requiresMembership?: boolean, status?: string } | null
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

  const closed =
    event.status === 'cerrado' || event.status === 'finalizado' || event.status === 'agotado'
  if (closed) return 'closed'

  if (session?.role !== 'athlete_plu') return 'guest'

  const athleteId = session.athleteId
  const registration = registrations.find(
    (item) =>
      item.athleteId === athleteId && (item.eventSlug === event.slug || item.event === event.title),
  )

  if (registration) {
    if (isRegistrationAdmitted(registration.status)) return 'registered'
    if (registration.status === 'pendiente_pago' || registration.status === 'validacion_manual') {
      return 'pending_payment'
    }
  }

  const membershipOk = hasCurrentMembership(memberships, athleteId)
  if (event.requiresMembership && !membershipOk) return 'needs_membership'

  if (event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados') {
    return 'can_register'
  }

  return null
}
