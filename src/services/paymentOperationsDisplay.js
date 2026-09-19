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

function formatPaymentOperationHeadline(row, t) {
  if (!row) return '—'

  if (row.operationKind === 'reconciliation') {
    return translateOrNull(t, 'admin.paymentOperations.reconciliation') ?? 'Conciliación de pago'
  }

  return (
    translateOrNull(t, EVENT_TYPE_KEYS[row.event_type]) ||
    (typeof row.event_type === 'string' && row.event_type.trim() ? row.event_type : '—')
  )
}

function formatPaymentOperationContext(row, t) {
  if (!row) return null

  const parts = []
  const kindLabel = translateOrNull(t, ORDER_KIND_KEYS[row.order_kind])
  if (kindLabel) parts.push(kindLabel)

  if (row.operationKind !== 'reconciliation' && row.action) {
    const actionLabel = translateOrNull(t, `admin.paymentOperations.eventAction.${row.action}`)
    if (actionLabel) parts.push(actionLabel)
  }

  return parts.length ? parts.join(' · ') : null
}

/**
 * Título operativo de un aviso o conciliación. El panel no puede mostrar el
 * `event_type` crudo de Mercado Pago ("payment"): el operador necesita saber
 * si es un cobro, una orden, una suscripción o una conciliación, y —cuando
 * el backend lo manda— si es de atleta o de entrada.
 */
export function formatPaymentOperationType(row, t) {
  const headline = formatPaymentOperationHeadline(row, t)
  const context = formatPaymentOperationContext(row, t)
  if (headline === '—' && !context) return '—'
  return context ? `${headline} · ${context}` : headline
}

export function formatPaymentOperationCardCopy(row, t) {
  return {
    headline: formatPaymentOperationHeadline(row, t),
    context: formatPaymentOperationContext(row, t),
  }
}
