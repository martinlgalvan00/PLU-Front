import QRCode from 'qrcode'
import { SHORT_TICKETS_PATH } from '../../../src/lib/ticketsRoute.js'

/**
 * Mail de una entrada ya paga: un PNG por credencial y el código de puerta
 * en el cuerpo. El `qr_token` no viaja en los params (el outbox los guarda).
 * El código sí, marcado como sensible en el catálogo, así el log lo redacta.
 */

export function buildTicketScanUrl(appUrl, token, eventSlug) {
  const base = String(appUrl || 'https://www.powerliftingunited.ar').replace(/\/$/, '')
  const url = new URL(base)
  url.searchParams.set('credencial', String(token))
  if (eventSlug) url.searchParams.set('evento', String(eventSlug))
  url.searchParams.set('tipo', 'ticket')
  return url.toString()
}

export function ticketConfirmationIdempotencyKey(order, { resend = false, now = new Date() } = {}) {
  if (resend) {
    const day = now.toISOString().slice(0, 10)
    return `email:ticket-confirmation:${order.id}:resend:${day}`
  }
  return `email:ticket-confirmation:${order.id}:${order.updated_at}`
}

function field(ticket, ...keys) {
  for (const key of keys) {
    const value = ticket?.[key]
    if (value != null && value !== '') return value
  }
  return null
}

export function isPrimaryTicket(ticket) {
  return ticket?.is_primary_credential !== false && ticket?.isPrimaryCredential !== false
}

/** Una compra de entrenador emite dos credenciales y sigue siendo una entrada. */
export function countBillableTickets(tickets = []) {
  const list = Array.isArray(tickets) ? tickets : []
  const primary = list.filter(isPrimaryTicket).length
  return primary || list.length
}

function attachmentName(ticketCode) {
  const code = String(ticketCode ?? 'entrada')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 60)
  return `qr-${code}.png`
}

/**
 * Todas las credenciales que se pueden mostrar, primarias primero.
 * La secundaria de un entrenador también abre una puerta: va en el mail.
 */
export function listMailablePasses(tickets = []) {
  const list = (Array.isArray(tickets) ? tickets : []).filter(
    (ticket) => ticket?.status !== 'cancelada',
  )
  return [...list].sort((left, right) => {
    const leftPrimary = isPrimaryTicket(left)
    const rightPrimary = isPrimaryTicket(right)
    if (leftPrimary === rightPrimary) return 0
    return leftPrimary ? -1 : 1
  })
}

async function renderQrPng(text) {
  return QRCode.toBuffer(text, { errorCorrectionLevel: 'H', margin: 2, width: 640 })
}

export async function buildTicketConfirmationDelivery({
  order,
  tickets = [],
  event = null,
  appUrl,
  resend = false,
  now = new Date(),
  openKey = null,
  renderQr = renderQrPng,
} = {}) {
  if (!order?.buyer_email) return null

  const slug = event?.slug ?? null
  const attachment = []
  const passes = []

  for (const ticket of listMailablePasses(tickets)) {
    const qrToken = field(ticket, 'qr_token', 'qrToken')
    const gateCode = field(ticket, 'gate_code', 'gateCode')
    const name = field(ticket, 'attendee_name', 'attendeeName')
    const type =
      field(ticket, 'credential_label', 'credentialLabel') ||
      ticket?.ticket_types?.name ||
      field(ticket, 'ticket_type_name', 'ticketTypeName') ||
      null
    const ticketCode = field(ticket, 'ticket_code', 'ticketCode') || field(ticket, 'id')

    if (qrToken) {
      const png = await renderQr(buildTicketScanUrl(appUrl, qrToken, slug))
      attachment.push({
        name: attachmentName(ticketCode),
        content: Buffer.from(png).toString('base64'),
      })
    }

    if (name || type || gateCode) {
      passes.push({
        name: name ?? '',
        type: type ?? '',
        gateCode: gateCode ?? '',
      })
    }
  }

  const reference = order.reference ?? ''
  const origin = String(appUrl || '').replace(/\/$/, '')

  return {
    to: order.buyer_email,
    toName: order.buyer_name,
    entityType: 'ticket_order',
    entityId: order.id,
    idempotencyKey: ticketConfirmationIdempotencyKey(order, { resend, now }),
    attachment,
    params: {
      name: order.buyer_name,
      eventTitle: event?.title ?? 'PLU ARG',
      eventDate: event?.starts_at ?? event?.eventDate ?? null,
      venue: event?.venue ?? null,
      quantity: String(countBillableTickets(tickets)),
      reference,
      ticketUrl: reference
        ? `${origin}${SHORT_TICKETS_PATH}?ref=${encodeURIComponent(reference)}${
            openKey ? `&k=${encodeURIComponent(openKey)}` : ''
          }`
        : '',
      passes,
    },
  }
}
