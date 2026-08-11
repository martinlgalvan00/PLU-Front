export function enrichMemberships(memberships, athletes) {
  return memberships.map((membership) => ({
    ...membership,
    athlete: athletes.find((athlete) => athlete.id === membership.athleteId) ?? null,
  }))
}

const DAY_MS = 24 * 60 * 60 * 1000

export const MEMBERSHIP_LIFECYCLE = Object.freeze({
  NONE: 'none',
  CURRENT: 'current',
  EXPIRING: 'expiring',
  SCHEDULED: 'scheduled',
  EXPIRED: 'expired',
  PENDING_PAYMENT: 'pending_payment',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  INACTIVE: 'inactive',
})

function dayTime(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value ?? Date.now())
  if (Number.isNaN(date.getTime())) return Number.NaN
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function membershipDateTime(value) {
  if (!value) return Number.NaN
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).getTime()
  }
  return dayTime(value)
}

/**
 * Proyección operativa única de una afiliación. El estado persistido cuenta
 * qué ocurrió; las fechas cuentan si el derecho cubre hoy. Mantener las dos
 * cosas separadas evita que una fila `activa` vencida habilite una credencial
 * hasta que corra el job de expiración.
 */
export function getMembershipLifecycle(membership, today = new Date(), withinDays = 30) {
  if (!membership) return MEMBERSHIP_LIFECYCLE.NONE

  if (membership.status === 'cancelada') return MEMBERSHIP_LIFECYCLE.CANCELLED
  if (membership.status === 'reembolsada') return MEMBERSHIP_LIFECYCLE.REFUNDED
  if (membership.status === 'pendiente_pago') return MEMBERSHIP_LIFECYCLE.PENDING_PAYMENT
  if (membership.status === 'vencida') return MEMBERSHIP_LIFECYCLE.EXPIRED
  if (membership.status !== 'activa') return MEMBERSHIP_LIFECYCLE.INACTIVE

  const currentDay = dayTime(today)
  const start = membershipDateTime(membership.startDate)
  const expiration = membershipDateTime(membership.expirationDate)

  if (Number.isFinite(start) && start > currentDay) return MEMBERSHIP_LIFECYCLE.SCHEDULED
  if (!Number.isFinite(expiration)) return MEMBERSHIP_LIFECYCLE.INACTIVE
  if (expiration < currentDay) return MEMBERSHIP_LIFECYCLE.EXPIRED
  if ((expiration - currentDay) / DAY_MS <= withinDays) return MEMBERSHIP_LIFECYCLE.EXPIRING
  return MEMBERSHIP_LIFECYCLE.CURRENT
}

/** Estado que se muestra y filtra en operaciones, derivado de estado + fechas. */
export function getMembershipOperationalStatus(membership, today = new Date()) {
  const lifecycle = getMembershipLifecycle(membership, today)
  if ([MEMBERSHIP_LIFECYCLE.CURRENT, MEMBERSHIP_LIFECYCLE.EXPIRING].includes(lifecycle)) {
    return 'activa'
  }
  if (lifecycle === MEMBERSHIP_LIFECYCLE.SCHEDULED) return 'programada'
  if (lifecycle === MEMBERSHIP_LIFECYCLE.EXPIRED) return 'vencida'
  if (lifecycle === MEMBERSHIP_LIFECYCLE.PENDING_PAYMENT) return 'pendiente_pago'
  if (lifecycle === MEMBERSHIP_LIFECYCLE.CANCELLED) return 'cancelada'
  if (lifecycle === MEMBERSHIP_LIFECYCLE.REFUNDED) return 'reembolsada'
  return membership?.status ?? 'pendiente_pago'
}

/**
 * Misma condición que exige `staff_check_in_registration` cuando el evento
 * pide afiliación: activa Y vigente hoy. Crear la inscripción ya no la
 * requiere; el gate vive en la puerta.
 */
export function isMembershipCurrent(membership, today = new Date()) {
  const lifecycle = getMembershipLifecycle(membership, today)
  return lifecycle === MEMBERSHIP_LIFECYCLE.CURRENT || lifecycle === MEMBERSHIP_LIFECYCLE.EXPIRING
}

/** ¿Este atleta tiene afiliación activa y vigente hoy? (ingreso en puerta si el meet la exige) */
export function hasCurrentMembership(memberships = [], athleteId, today = new Date()) {
  if (!athleteId) return false
  return memberships.some(
    (membership) => membership.athleteId === athleteId && isMembershipCurrent(membership, today),
  )
}

/** Cobertura que ya terminó, distinta de una afiliación que nunca se pagó. */
export function isMembershipExpired(membership, today = new Date()) {
  return getMembershipLifecycle(membership, today) === MEMBERSHIP_LIFECYCLE.EXPIRED
}

export function isExpiringSoon(expirationDate, withinDays = 30, today = new Date()) {
  const expiration = membershipDateTime(expirationDate)
  const currentDay = dayTime(today)
  if (!Number.isFinite(expiration) || !Number.isFinite(currentDay)) return false
  const diffDays = (expiration - currentDay) / DAY_MS
  return diffDays >= 0 && diffDays <= withinDays
}

/** Métricas sobre el padrón que ya llega en el snapshot admin. */
export function getMembershipStats(memberships = [], today = new Date()) {
  const day = new Date(today)
  day.setHours(0, 0, 0, 0)
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1).getTime()

  let active = 0
  let newThisMonth = 0
  let expiringSoon = 0
  let pendingPayment = 0

  for (const membership of memberships) {
    const isCurrent = isMembershipCurrent(membership, day)
    if (isCurrent) active += 1

    const startTime = membershipDateTime(membership.startDate)
    if (Number.isFinite(startTime) && startTime >= monthStart && startTime <= day.getTime()) {
      newThisMonth += 1
    }

    if (isCurrent && isExpiringSoon(membership.expirationDate, 30, day)) expiringSoon += 1
    if (membership.status === 'pendiente_pago') pendingPayment += 1
  }

  return { active, newThisMonth, expiringSoon, pendingPayment }
}

/** Últimas afiliaciones por fecha de alta, para el vistazo del panel. */
export function getRecentMemberships(memberships = [], limit = 6) {
  return [...memberships]
    .sort((a, b) => {
      const timeA = membershipDateTime(a.startDate)
      const timeB = membershipDateTime(b.startDate)
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0)
    })
    .slice(0, limit)
}

export function filterMemberships(items, filters = {}) {
  const query = filters.query?.trim().toLowerCase() ?? ''
  const today = filters.today ?? new Date()

  return items.filter((item) => {
    const operationalStatus = getMembershipOperationalStatus(item, today)
    const statusMatch =
      !filters.status || filters.status === 'all' || operationalStatus === filters.status
    const expiringMatch =
      filters.expiring !== 'soon' ||
      (isMembershipCurrent(item, today) && isExpiringSoon(item.expirationDate, 30, today))
    const queryMatch =
      !query ||
      item.athlete?.fullName?.toLowerCase().includes(query) ||
      item.athlete?.documentId?.includes(query) ||
      item.memberCode?.toLowerCase().includes(query)

    return statusMatch && expiringMatch && queryMatch
  })
}
