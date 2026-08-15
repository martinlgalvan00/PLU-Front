// La acreditación de un pago de Mercado Pago (apply_mercado_pago_payment,
// supabase/migrations/20260818110000_payment_status_monotonic_guard.sql)
// activa la afiliación/inscripción con un UPDATE ... where payment_order_id
// = <la orden> -- no un upsert. Si para ese momento la fila de membership/
// registration ya fue repuntada a otra orden (reintento del atleta) o nunca
// se creó, el UPDATE no matchea nada: la orden queda 'aprobado' con la plata
// cobrada, pero nadie recibe la afiliación/inscripción y no salta ningún
// error. Esto detecta esos casos ya ocurridos para mostrarlos en el panel,
// sin tocar la lógica de acreditación.

const RECONCILED_MEMBERSHIP_STATUSES = new Set(['activa', 'vencida'])
const RECONCILED_REGISTRATION_STATUSES = new Set(['pagada', 'confirmada', 'observada'])

/**
 * Pagos aprobados que no tienen del otro lado una afiliación/inscripción
 * que los refleje. `conceptType` viene de athleteApi.mapAthleteData
 * (valor crudo 'membership' | 'registration' | 'combo', separado del label
 * ya formateado en `concept`).
 */
export function findUnreconciledApprovedPayments({
  memberships = [],
  registrations = [],
  payments = [],
  athletes = [],
} = {}) {
  const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]))

  const reconciledMembershipOrderIds = new Set(
    memberships
      .filter(
        (membership) =>
          membership.paymentOrderId && RECONCILED_MEMBERSHIP_STATUSES.has(membership.status),
      )
      .map((membership) => membership.paymentOrderId),
  )
  const reconciledRegistrationOrderIds = new Set(
    registrations
      .filter(
        (registration) =>
          registration.paymentOrderId && RECONCILED_REGISTRATION_STATUSES.has(registration.status),
      )
      .map((registration) => registration.paymentOrderId),
  )

  return payments
    .filter((order) => order.status === 'aprobado')
    .map((order) => {
      const needsMembership = order.conceptType === 'membership' || order.conceptType === 'combo'
      const needsRegistration =
        order.conceptType === 'registration' || order.conceptType === 'combo'
      const missingMembership = needsMembership && !reconciledMembershipOrderIds.has(order.id)
      const missingRegistration = needsRegistration && !reconciledRegistrationOrderIds.has(order.id)
      if (!missingMembership && !missingRegistration) return null
      return {
        ...order,
        athlete: athleteById.get(order.athleteId) ?? null,
        missingMembership,
        missingRegistration,
      }
    })
    .filter(Boolean)
}
