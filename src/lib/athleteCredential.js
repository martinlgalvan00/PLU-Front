import { isRegistrationForEvent } from './athleteEventStatus.js'
import { resolveCredentialCode } from './credentialQr.js'
import {
  getRegistrationGateLabelKey,
  isGateAccessReady,
  resolveRequiresMembership,
} from './gateAccess.js'
import { isRegistrationAdmitted } from './status.js'
import { hasCurrentMembership, isMembershipCurrent } from '../services/membershipService.js'

/**
 * Una sola lectura de la credencial de la persona.
 *
 * La card del inicio y Mi QR tienen que decir lo mismo: el QR existe si hay
 * afiliación vigente o una inscripción confirmada, y el estado es el que va
 * a ver la puerta. El código sale de `resolveCredentialCode`.
 */
function focusedAdmittedRegistration(admitted, focusEventSlug, events) {
  if (!focusEventSlug || admitted.length === 0) return admitted[0] ?? null
  const catalogEvent = (events ?? []).find((event) => event?.slug === focusEventSlug) ?? {
    slug: focusEventSlug,
  }
  return (
    admitted.find((item) => isRegistrationForEvent(item, catalogEvent)) ?? admitted[0] ?? null
  )
}

export function describeAthleteCredential({
  athlete,
  membership,
  latestMembership = null,
  registrations = [],
  events,
  focusEventSlug = null,
} = {}) {
  const credentialCode = resolveCredentialCode({ athlete, membership, latestMembership })
  const membershipCurrent = isMembershipCurrent(membership)
  const admittedRegistrations = (registrations ?? []).filter((item) =>
    isRegistrationAdmitted(item.status),
  )
  const primaryMeet = focusedAdmittedRegistration(admittedRegistrations, focusEventSlug, events)
  const hasCredential =
    Boolean(credentialCode) && (membershipCurrent || admittedRegistrations.length > 0)
  const meetRequiresMembership = primaryMeet
    ? resolveRequiresMembership(primaryMeet, events)
    : false
  const gateReady = primaryMeet
    ? isGateAccessReady({
        registrationStatus: primaryMeet.status,
        requiresMembership: meetRequiresMembership,
        membershipCurrent,
      })
    : membershipCurrent
  const gateLabelKey = primaryMeet
    ? getRegistrationGateLabelKey(primaryMeet, { membershipCurrent, events })
    : null

  let statusKey = 'account.membershipInactive'
  if (hasCredential && membershipCurrent && primaryMeet) statusKey = 'account.qr.unifiedStatus'
  else if (hasCredential && membershipCurrent) statusKey = 'account.membershipActive'
  else if (hasCredential && gateLabelKey) statusKey = gateLabelKey
  else if (hasCredential) statusKey = 'account.qr.meetPassMeta'

  return {
    credentialCode,
    membershipCurrent,
    admittedRegistrations,
    primaryMeet,
    hasCredential,
    canShowQr: hasCredential,
    meetRequiresMembership,
    gateReady,
    gateLabelKey,
    statusKey,
    statusReady: hasCredential && (membershipCurrent || gateReady),
  }
}

/**
 * La base hace `coalesce(requires_membership, true)`. `null` es ese caso.
 * Si la bandera no vino en el objeto, no se inventa un bloqueo: los QR viejos
 * de la puerta no la traían y la inscripción confirmada alcanzaba.
 */
export function doorRequiresMembership(registration) {
  if (typeof registration?.requiresMembership === 'boolean') {
    return registration.requiresMembership
  }
  return registration?.requiresMembership === null
}

/**
 * Veredicto de la página de la puerta para la credencial de la persona.
 *
 * Con `?evento=` se juzga esa inscripción. Sin evento, la credencial es válida
 * si la afiliación está vigente o si alguna inscripción admitida ya puede
 * entrar. Un torneo que pide afiliación y no la tiene no pinta verde.
 */
export function describeDoorCredential({
  membership,
  registration = null,
  registrations = [],
  eventSlug = null,
} = {}) {
  const membershipCurrent = isMembershipCurrent(membership)
  const subjects = eventSlug ? (registration ? [registration] : []) : (registrations ?? [])
  const gates = subjects.filter(Boolean).map((item) => {
    const requiresMembership = doorRequiresMembership(item)
    return {
      registration: item,
      requiresMembership,
      ready: isGateAccessReady({
        registrationStatus: item.status,
        requiresMembership,
        membershipCurrent,
      }),
    }
  })

  let verdict = 'warning'
  if (eventSlug) {
    verdict = registration ? (gates.some((gate) => gate.ready) ? 'valid' : 'warning') : 'unknown'
  } else if (membershipCurrent || gates.some((gate) => gate.ready)) {
    verdict = 'valid'
  }

  return { verdict, membershipCurrent, gates }
}

/**
 * La fila y el escáner de check-in parten de `pagada` cuando la inscripción
 * está confirmada. Si el meet pide afiliación y no está vigente, bajan a
 * `needs_membership`: el botón no se habilita y el escaneo queda `not_ready`.
 * Sin la bandera no se bloquea: la allowlist ya filtró, y un QR viejo no la trae.
 */
export function applyAthleteCheckinGate(status, registration, { membership = null, memberships = null } = {}) {
  if (status !== 'pagada') return status
  if (!doorRequiresMembership(registration)) return status
  const current = Array.isArray(memberships)
    ? hasCurrentMembership(memberships, registration?.athleteId)
    : isMembershipCurrent(membership)
  return current ? status : 'needs_membership'
}
