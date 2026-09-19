export function tPlural(t, key, count) {
  const n = Number(count) || 0
  return t(n === 1 ? `${key}_one` : `${key}_other`, { count: n })
}

const HEALTH_BREAKDOWN = [
  ['athleteOrderDrift', 'admin.paymentOperations.healthAthleteDrift'],
  ['ticketOrderDrift', 'admin.paymentOperations.healthTicketDrift'],
  ['staleEventLocks', 'admin.paymentOperations.healthStaleEventLocks'],
  ['staleReconciliationLocks', 'admin.paymentOperations.healthStaleReconciliationLocks'],
  ['exhaustedEvents', 'admin.paymentOperations.healthExhaustedEvents'],
]

export function buildPaymentHealthBreakdown(health, t) {
  if (!health || health.healthy !== false) return []
  return HEALTH_BREAKDOWN.flatMap(([field, key]) => {
    const n = Number(health[field] ?? 0)
    return n > 0 ? [tPlural(t, key, n)] : []
  })
}
