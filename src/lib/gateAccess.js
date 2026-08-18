import { UPCOMING_EVENTS } from './events.js'
import { isGateAccessReady, isRegistrationAdmitted } from './status.js'
import { hasCurrentMembership, isMembershipCurrent } from '../services/membershipService.js'

/**
 * ¿El meet de esta inscripción exige afiliación?
 * Prioridad: flag en la proyección → catálogo de eventos (admin o seed).
 */
export function resolveRequiresMembership(registration, events = UPCOMING_EVENTS) {
  if (typeof registration?.requiresMembership === 'boolean') {
    return registration.requiresMembership
  }
  const catalog = events?.length ? events : UPCOMING_EVENTS
  const match = catalog.find(
    (event) => event.slug === registration?.eventSlug || event.title === registration?.event,
  )
  return Boolean(match?.requiresMembership)
}

/** Inscripción admitida pero la puerta todavía no deja pasar por falta de afiliación. */
export function isRegistrationGatePending(
  registration,
  { membershipCurrent = false, events = UPCOMING_EVENTS } = {},
) {
  if (!registration) return false
  const requiresMembership = resolveRequiresMembership(registration, events)
  return isRegistrationAdmitted(registration.status) && requiresMembership && !membershipCurrent
}

export function getRegistrationGateLabelKey(registration, { membershipCurrent, events } = {}) {
  if (!isRegistrationAdmitted(registration?.status)) return null
  const ready = isGateAccessReady({
    registrationStatus: registration.status,
    requiresMembership: resolveRequiresMembership(registration, events),
    membershipCurrent,
  })
  return ready ? 'account.qr.gateReady' : 'account.qr.gateReserved'
}

/** Inscripciones del atleta con cupo ok pero ingreso bloqueado por afiliación. */
export function findGatePendingRegistrations(
  registrations = [],
  { memberships = [], athleteId = null, events = UPCOMING_EVENTS } = {},
) {
  return registrations.filter((registration) => {
    if (athleteId && registration.athleteId && registration.athleteId !== athleteId) return false
    const membershipCurrent = athleteId
      ? hasCurrentMembership(memberships, athleteId)
      : memberships.some(
          (membership) =>
            membership.athleteId === registration.athleteId && isMembershipCurrent(membership),
        )
    return isRegistrationGatePending(registration, { membershipCurrent, events })
  })
}

export { isGateAccessReady, isRegistrationAdmitted }
