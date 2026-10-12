import { buildCredentialUrl } from './credentialQr.js'
import { SHORT_TICKETS_PATH } from './ticketsRoute.js'
import { TICKET_VALIDITY_STATUS, ticketValidityStatus } from './ticketValidity.js'

/**
 * Qué puede hacer hoy el QR de una entrada vendida, visto desde el panel.
 *
 * Es una lectura para el operador, no la autorización: la puerta la decide
 * `staff_check_in_ticket` en el servidor. Acá sólo se ordena lo que la fila ya
 * trae (estado de pago, ingreso registrado y vigencia congelada) en un único
 * estado, para que la tabla y el panel lo digan igual.
 *
 * Orden de precedencia: una entrada cancelada o sin pagar no abre nada aunque
 * tenga vigencia; una ya ingresada se muestra como usada aunque venza después.
 *
 * @param {object} ticket Entrada con la forma de `toCamelTicket`.
 * @param {Date} [now]
 * @returns {'cancelled' | 'unpaid' | 'used' | 'expired' | 'upcoming' | 'ready'}
 */
export function ticketAdmissionState(ticket, now = new Date()) {
  if (ticket?.status === 'cancelada') return 'cancelled'
  if (ticket?.status !== 'pagada') return 'unpaid'
  if (ticket?.checkIn?.scannedAt) return 'used'
  const validity = ticketValidityStatus(ticket, now)
  if (validity === TICKET_VALIDITY_STATUS.EXPIRED) return 'expired'
  if (validity === TICKET_VALIDITY_STATUS.UPCOMING) return 'upcoming'
  return 'ready'
}

/** El QR sólo se muestra (y se comparte) cuando la entrada está acreditada. */
export function ticketHasUsableQr(ticket) {
  return ticket?.status === 'pagada' && Boolean(ticket?.qrToken)
}

/**
 * URL que va dentro del QR de una entrada. Lleva el `qrToken` opaco, nunca el
 * código humano secuencial: es lo único que el backend acepta para verificar.
 */
export function buildTicketQrUrl(ticket, eventSlug) {
  return buildCredentialUrl({
    code: ticket.qrToken,
    eventSlug: eventSlug ?? ticket.eventSlug ?? ticket.event?.slug,
    type: 'ticket',
  })
}

/** Enlace a "Mis entradas" para reenviarle al comprador (el que va en su mail). */
export function buildBuyerTicketsUrl(reference) {
  if (!reference) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${SHORT_TICKETS_PATH}?ref=${encodeURIComponent(reference)}`
}

/** Totales de la franja de resumen de "Entradas vendidas". */
export function summarizeSoldTickets(tickets = []) {
  let paid = 0
  let pending = 0
  let checkedIn = 0
  for (const ticket of tickets) {
    if (ticket.status === 'pagada') {
      paid += 1
      if (ticket.checkIn?.scannedAt) checkedIn += 1
    } else if (ticket.status === 'pendiente_pago') {
      pending += 1
    }
  }
  return { issued: tickets.length, paid, pending, checkedIn }
}

/** Nombre de archivo del PNG del QR: el código es legible y único por entrada. */
export function ticketQrFileName(ticket) {
  const code = String(ticket?.ticketCode ?? ticket?.id ?? 'entrada')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 60)
  return `qr-${code}.png`
}
