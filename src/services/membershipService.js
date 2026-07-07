export function enrichMemberships(memberships, athletes) {
  return memberships.map((membership) => ({
    ...membership,
    athlete: athletes.find((athlete) => athlete.id === membership.athleteId) ?? null,
  }))
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
