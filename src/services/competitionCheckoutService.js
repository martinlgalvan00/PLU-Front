/**
 * competitionCheckoutService.js — PLU ARG
 *
 * Reanuda una inscripción de competencia que quedó impaga. El RPC es la
 * autoridad; esto solo arma el mismo `createdOrder` si el servidor todavía
 * responde PLU08 (migración no aplicada) y el snapshot ya trae la orden.
 */

const OPEN_PAYMENT_STATUSES = new Set(['pendiente', 'validacion_manual', 'creado'])

export function findPendingEventRegistration(registrations = [], { athleteId, event } = {}) {
  if (!athleteId || !event) return null
  return (
    registrations.find(
      (item) =>
        item.athleteId === athleteId &&
        (item.eventSlug === event.slug || item.event === event.title) &&
        item.status === 'pendiente_pago',
    ) ?? null
  )
}

export function findOpenPaymentForRegistration(payments = [], registration) {
  if (!registration?.paymentOrderId) return null
  const payment = payments.find((item) => item.id === registration.paymentOrderId)
  if (!payment || !OPEN_PAYMENT_STATUSES.has(payment.status)) return null
  return payment
}

export function buildCompetitionCreatedOrder({
  athlete,
  payment,
  purchaseType,
  session,
  preferenceId = null,
  plan = null,
  comboOffer = null,
}) {
  return {
    type: 'competition',
    athleteName: athlete.fullName,
    athleteDocument: athlete.documentId,
    athleteId: athlete.id,
    payerEmail: athlete.email ?? session?.email ?? null,
    paymentId: payment.id,
    paymentMethod: payment.method,
    preferenceId,
    paymentMode: 'payment',
    purchaseType,
    plan,
    comboOffer,
    id: payment.id,
    concept: payment.concept,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    reference: payment.reference,
    createdAt: payment.createdAt,
  }
}
