export function enrichMemberships(memberships, athletes) {
  return memberships.map((membership) => ({
    ...membership,
    athlete: athletes.find((athlete) => athlete.id === membership.athleteId) ?? null,
  }))
}

/**
 * Misma condición que exige `create_competition_registration_v2` para dejar
 * inscribirse: activa Y vigente hoy. El cliente solo miraba `status` y una
 * afiliación marcada activa con fechas vencidas pasaba el chequeo local para
 * después fallar con PLU05 recién al enviar el formulario.
 */
export function isMembershipCurrent(membership, today = new Date()) {
  if (membership?.status !== 'activa') return false

  const day = new Date(today)
  day.setHours(0, 0, 0, 0)
  const dayTime = day.getTime()

  const startTime = membership.startDate ? Date.parse(`${membership.startDate}T00:00:00`) : null
  if (Number.isFinite(startTime) && startTime > dayTime) return false

  const expirationTime = membership.expirationDate
    ? Date.parse(`${membership.expirationDate}T00:00:00`)
    : null
  // Sin fecha de vencimiento el servidor no deja pasar (coalesce a ayer), así
  // que acá tampoco.
  if (!Number.isFinite(expirationTime) || expirationTime < dayTime) return false

  return true
}

/** ¿Este atleta puede inscribirse hoy a un evento que exige afiliación? */
export function hasCurrentMembership(memberships = [], athleteId, today = new Date()) {
  if (!athleteId) return false
  return memberships.some(
    (membership) => membership.athleteId === athleteId && isMembershipCurrent(membership, today),
  )
}

export function isExpiringSoon(expirationDate, withinDays = 30) {
  const expiration = new Date(expirationDate)
  const now = new Date()
  const diffDays = (expiration - now) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= withinDays
}

export function filterMemberships(items, filters = {}) {
  const query = filters.query?.trim().toLowerCase() ?? ''

  return items.filter((item) => {
    const statusMatch = !filters.status || filters.status === 'all' || item.status === filters.status
    const expiringMatch =
      filters.expiring !== 'soon' || (item.status === 'activa' && isExpiringSoon(item.expirationDate))
    const queryMatch =
      !query ||
      item.athlete?.fullName?.toLowerCase().includes(query) ||
      item.athlete?.documentId?.includes(query) ||
      item.memberCode?.toLowerCase().includes(query)

    return statusMatch && expiringMatch && queryMatch
  })
}
