import { resolveRequiresMembership } from './gateAccess.js'
import { isGateAccessReady, isRegistrationAdmitted } from './status.js'

/**
 * Pase de un atleta para UN evento: lo que va a decir la puerta al escanear su
 * QR, dicho antes de llegar. La credencial es una sola (el QR del perfil); lo
 * que cambia por evento es el veredicto.
 *
 * Estados, en el orden en que se muestran:
 * - `checked_in`: la puerta ya registró el ingreso.
 * - `ready`: inscripción confirmada y, si el evento la pide, afiliación vigente.
 * - `needs_membership`: confirmada, pero el evento pide afiliación y no está vigente.
 * - `payment_pending`: el cupo existe pero el pago no se acreditó.
 * - `observed`: el pago está en revisión (comprobante observado).
 *
 * Canceladas, rechazadas y eventos que ya terminaron no generan pase.
 */
export const EVENT_PASS_ORDER = [
  'checked_in',
  'ready',
  'needs_membership',
  'payment_pending',
  'observed',
]

const DAY_MS = 86_400_000

function eventEnded(registration, now) {
  if (registration?.upcoming === false) return true
  const end = registration?.eventEndsAt ?? registration?.eventStartsAt
  const time = end ? new Date(end).getTime() : Number.NaN
  // Un día de margen: el pase sigue a mano durante toda la jornada.
  return Number.isFinite(time) && time + DAY_MS < now.getTime()
}

export function describeEventPass(
  registration,
  { membershipCurrent = false, events, now = new Date() } = {},
) {
  if (!registration?.status) return null
  if (registration.checkedInAt) return { state: 'checked_in', registration }
  if (eventEnded(registration, now)) return null

  if (isRegistrationAdmitted(registration.status)) {
    const requiresMembership = resolveRequiresMembership(registration, events)
    const ready = isGateAccessReady({
      registrationStatus: registration.status,
      requiresMembership,
      membershipCurrent,
    })
    return { state: ready ? 'ready' : 'needs_membership', registration }
  }
  if (registration.status === 'pendiente_pago') return { state: 'payment_pending', registration }
  if (registration.status === 'observada') return { state: 'observed', registration }
  return null
}

/**
 * Pases por fecha del evento, el más próximo primero. Los ya usados van al
 * final: son historial, no algo que haya que mostrar en la puerta.
 */
export function listEventPasses(registrations = [], options = {}) {
  const used = (pass) => (pass.state === 'checked_in' ? 1 : 0)
  const startsAt = (pass) => new Date(pass.registration.eventStartsAt ?? 0).getTime() || 0
  return registrations
    .map((registration) => describeEventPass(registration, options))
    .filter(Boolean)
    .sort((a, b) => used(a) - used(b) || startsAt(a) - startsAt(b))
}
