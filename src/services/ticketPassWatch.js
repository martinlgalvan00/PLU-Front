/** Estados en los que la entrada todavía puede acreditarse. */
export const TICKET_PASS_OPEN_STATUSES = new Set(['creado', 'pendiente', 'validacion_manual'])

/** La compra ya no va a tener QR. */
export const TICKET_PASS_CLOSED_STATUSES = new Set(['rechazado', 'cancelado', 'reembolsado'])

export const TICKET_PASS_SETTLE_ATTEMPTS = 8
export const TICKET_PASS_SETTLE_MS = 2_000
export const TICKET_PASS_WATCH_MS = 8_000

/**
 * `settle`: el pago ya figura acreditado y falta el QR del servidor.
 * `watch`: transferencia, efectivo o Mercado Pago todavía abiertos.
 */
export function ticketPassWatchMode(order) {
  if (order?.type !== 'tickets' || !order.orderId || !order.orderAccessToken || order.passFresh) {
    return null
  }
  if (order.status === 'aprobado') return 'settle'
  if (TICKET_PASS_OPEN_STATUSES.has(order.status)) return 'watch'
  return null
}

export function ticketOrderAwaitingPayment(status) {
  return status !== 'aprobado' && !TICKET_PASS_CLOSED_STATUSES.has(status)
}
