const EVENT_TYPE_KEYS = Object.freeze({
  payment: 'admin.paymentOperations.eventType.payment',
  merchant_order: 'admin.paymentOperations.eventType.merchantOrder',
  subscription_preapproval: 'admin.paymentOperations.eventType.subscriptionPreapproval',
  subscription_authorized_payment: 'admin.paymentOperations.eventType.subscriptionAuthorizedPayment',
})

const ORDER_KIND_KEYS = Object.freeze({
  athlete: 'admin.paymentOperations.orderKind.athlete',
  ticket: 'admin.paymentOperations.orderKind.ticket',
})

function translateOrNull(t, key) {
  if (!t || !key) return null
  const value = t(key)
  return typeof value === 'string' && value !== key ? value : null
}

/**
 * Título operativo de un aviso o conciliación. El panel no puede mostrar el
 * `event_type` crudo de Mercado Pago ("payment"): el operador necesita saber
 * si es un cobro, una orden, una suscripción o una conciliación, y —cuando
 * el backend lo manda— si es de atleta o de entrada.
 */
export function formatPaymentOperationType(row, t) {
  if (!row) return '—'

  const kindLabel = translateOrNull(t, ORDER_KIND_KEYS[row.order_kind])

  if (row.operationKind === 'reconciliation') {
    const base =
      translateOrNull(t, 'admin.paymentOperations.reconciliation') ?? 'Conciliación de pago'
    return kindLabel ? `${base} · ${kindLabel}` : base
  }

  const typeLabel =
    translateOrNull(t, EVENT_TYPE_KEYS[row.event_type]) ||
    (typeof row.event_type === 'string' && row.event_type.trim() ? row.event_type : '—')

  const subject = kindLabel ? `${typeLabel} · ${kindLabel}` : typeLabel
  const actionLabel = row.action
    ? translateOrNull(t, `admin.paymentOperations.eventAction.${row.action}`)
    : null

  return actionLabel ? `${subject} · ${actionLabel}` : subject
}
