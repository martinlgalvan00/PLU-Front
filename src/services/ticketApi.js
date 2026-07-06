import { apiGet, apiPost } from '../lib/api.js'

/**
 * ticketApi.js — PLU ARG
 *
 * A diferencia del resto del dominio (atletas/membresías/inscripciones,
 * que siguen viviendo en localStorage), las entradas generales hablan con
 * el backend real (Postgres) — es la parte del sistema que necesita la
 * garantía dura de "no se puede duplicar/reusar", y esa garantía solo
 * existe si hay una base de datos real arbitrando el check-in.
 */

export function createTicketOrder({ eventSlug, attendees, buyer, provider }) {
  return apiPost('/api/tickets/orders', { eventSlug, attendees, buyer, provider })
}

export function approveTicketOrder(orderId) {
  return apiPost(`/api/tickets/orders/${orderId}/approve`, {})
}

export function verifyTicketByQrToken(qrToken) {
  return apiGet(`/api/tickets/verify/${qrToken}`)
}

export function listTicketsForEvent(eventSlug) {
  return apiGet(`/api/tickets?eventSlug=${encodeURIComponent(eventSlug)}`)
}

export function checkInTicket(qrToken, gate) {
  return apiPost(`/api/tickets/checkin/${qrToken}`, { gate })
}

export function checkInRegistration(registrationId, gate) {
  return apiPost(`/api/tickets/registrations/${registrationId}/checkin`, { gate })
}

/**
 * Normaliza un ticket devuelto por la API a la forma que ya esperaban los
 * componentes (EventShareCard, TicketPurchaseSection, CheckInSection).
 * `purchaseEvent` opcional: cuando viene de una compra recién hecha, trae
 * los textos ya formateados (fecha "12 y 13 de diciembre...") en vez de la
 * fecha ISO cruda que devuelve el join de Event.
 */
export function mapApiTicket(apiTicket, purchaseEvent) {
  return {
    id: apiTicket.id,
    orderId: apiTicket.orderId,
    ticketCode: apiTicket.ticketCode,
    qrToken: apiTicket.qrToken,
    attendeeName: apiTicket.attendeeName,
    attendeeDni: apiTicket.attendeeDni,
    dayPass: apiTicket.dayPass,
    status: apiTicket.status,
    checkedInAt: apiTicket.checkIn?.scannedAt ?? null,
    eventSlug: purchaseEvent?.slug ?? apiTicket.event?.slug,
    eventTitle: purchaseEvent?.title ?? apiTicket.event?.title,
    eventDate: purchaseEvent?.date ?? apiTicket.event?.eventDate,
    eventVenue: purchaseEvent?.venue ?? apiTicket.event?.venue,
    eventLocation: purchaseEvent?.location ?? apiTicket.event?.location,
  }
}
