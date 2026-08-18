export function findRegistrationPayment(payments, registration) {
  if (registration.paymentOrderId) {
    const exact = payments.find((item) => item.id === registration.paymentOrderId)
    if (exact) return exact
  }
  return payments.find(
    (item) =>
      item.athleteId === registration.athleteId &&
      (registration.event ? item.event === registration.event : true),
  )
}

/**
 * Misma semántica que `findRegistrationPayment` pero indexada: la arma una
 * vez por lista de pagos en vez de escanearla linealmente por cada
 * inscripción (usado por listados con muchas filas — Inscripciones, Atletas).
 */
export function createRegistrationPaymentIndex(payments = []) {
  const byOrderId = new Map()
  const byAthleteEvent = new Map()
  const byAthlete = new Map()
  for (const payment of payments) {
    if (payment.id != null && !byOrderId.has(payment.id)) byOrderId.set(payment.id, payment)
    const eventKey = `${payment.athleteId}|${payment.event}`
    if (!byAthleteEvent.has(eventKey)) byAthleteEvent.set(eventKey, payment)
    if (!byAthlete.has(payment.athleteId)) byAthlete.set(payment.athleteId, payment)
  }
  return { byOrderId, byAthleteEvent, byAthlete }
}

export function resolveRegistrationPayment(index, registration) {
  if (registration.paymentOrderId) {
    const exact = index.byOrderId.get(registration.paymentOrderId)
    if (exact) return exact
  }
  if (registration.event) {
    return index.byAthleteEvent.get(`${registration.athleteId}|${registration.event}`)
  }
  return index.byAthlete.get(registration.athleteId)
}

/**
 * Inscripciones agrupadas por atleta, una sola pasada. Compartido por
 * AthletesSection y MembershipsSection para responder "¿este atleta tiene
 * alguna inscripción?" sin recorrer todo `registrations` por cada atleta.
 */
export function groupRegistrationsByAthlete(registrations = []) {
  const map = new Map()
  for (const registration of registrations) {
    const list = map.get(registration.athleteId)
    if (list) list.push(registration)
    else map.set(registration.athleteId, [registration])
  }
  return map
}

/** Filtro único de estado de inscripción, compartido por RegistrationsSection, AthletesSection y useAppData. */
export function matchesRegistrationStatusFilter(registration, payment, filter, gatePendingIds) {
  if (filter === 'all') return true
  if (filter === 'gate_pending') return gatePendingIds.has(registration.id)
  return (
    registration.status === filter ||
    registration.paymentStatus === filter ||
    payment?.status === filter
  )
}
