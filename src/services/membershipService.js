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

/**
 * Cobertura que ya terminó, distinta de una afiliación que nunca se pagó.
 *
 * `isMembershipCurrent` colapsa los dos casos en "no vigente", y la cuenta los
 * mostraba a ambos como "Pendiente de pago": a un socio cuya afiliación venció
 * eso lo manda a buscar un pago que sí hizo. Lo que corresponde ofrecerle es
 * renovar.
 *
 * Una renovación programada (alta con `startDate` futuro sobre una cobertura
 * que todavía corre) tampoco es vigente, pero no está vencida: por eso se mira
 * la fecha de vencimiento y no el resultado de `isMembershipCurrent`.
 */
export function isMembershipExpired(membership, today = new Date()) {
  if (!membership) return false
  if (!['activa', 'vencida'].includes(membership.status)) return false

  const day = new Date(today)
  day.setHours(0, 0, 0, 0)

  const expirationTime = membership.expirationDate
    ? Date.parse(`${membership.expirationDate}T00:00:00`)
    : null
  if (!Number.isFinite(expirationTime)) {
    // Sin fecha, el servidor la trata como no vigente (coalesce a ayer). Una
    // fila marcada 'vencida' sin fecha sigue siendo una afiliación vencida.
    return membership.status === 'vencida'
  }

  return expirationTime < day.getTime()
}

export function isExpiringSoon(expirationDate, withinDays = 30) {
  const expiration = new Date(expirationDate)
  const now = new Date()
  const diffDays = (expiration - now) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= withinDays
}

/**
 * Métricas de afiliación para el panel. Se calculan sobre el padrón que ya
 * llega en el snapshot admin: no hay endpoint aparte porque el dataset de
 * afiliados de PLU ARG es chico y viaja entero, mismo criterio que el resto
 * del panel.
 */
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

    // Altas del mes: la fecha de inicio es la que marca desde cuándo el socio
    // está cubierto, que es lo que se reporta.
    const startTime = membership.startDate
      ? Date.parse(`${membership.startDate}T00:00:00`)
      : null
    if (Number.isFinite(startTime) && startTime >= monthStart && startTime <= day.getTime()) {
      newThisMonth += 1
    }

    if (isCurrent && isExpiringSoon(membership.expirationDate)) expiringSoon += 1
    if (membership.status === 'pendiente_pago') pendingPayment += 1
  }

  return { active, newThisMonth, expiringSoon, pendingPayment }
}

/** Últimas afiliaciones por fecha de alta, para el vistazo del panel. */
export function getRecentMemberships(memberships = [], limit = 6) {
  return [...memberships]
    .sort((a, b) => {
      const timeA = Date.parse(`${a.startDate ?? ''}T00:00:00`)
      const timeB = Date.parse(`${b.startDate ?? ''}T00:00:00`)
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0)
    })
    .slice(0, limit)
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
