import { generateId, todayISO } from '../lib/format.js'
import { createPaymentReference, getPaymentStatusForMethod } from './paymentService.js'

/**
 * ticketService.js — PLU ARG
 *
 * Venta de entradas generales (espectadores, sin necesidad de cuenta ni
 * afiliación) para un evento. Una compra puede incluir varios asistentes
 * (cada uno con su DNI) — cada asistente recibe su propio ticket con su
 * propio código, para que cada persona ingrese por separado con su QR.
 *
 * Nota de arquitectura: los tickets viven en el mismo localStorage que el
 * resto de los datos de la app (no hay backend compartido todavía), así que
 * el check-in en la puerta solo "ve" tickets creados en ese mismo navegador.
 * El modelo (código único, estado, checkedInAt) ya está listo para
 * conectarse a una API real más adelante sin rehacer el flujo.
 */

function buildTicketCode(sequence) {
  return `TCK-${String(sequence).padStart(5, '0')}`
}

/**
 * Precio de un asistente según el/los día(s) elegidos.
 * @param {'day1'|'day2'|'both'} dayPass
 * @param {{ day: number, bothDays: number }} pricing
 */
export function priceForDayPass(dayPass, pricing) {
  return dayPass === 'both' ? pricing.bothDays : pricing.day
}

/**
 * Crea una orden de entradas: un ticket individual por asistente. Cada
 * asistente elige su propio día (día 1, día 2 o ambos) — no es un valor
 * único por compra, porque un grupo puede mezclar pases distintos.
 * @param {{
 *   event: object,
 *   attendees: {fullName:string, dni:string, dayPass:'day1'|'day2'|'both'}[],
 *   paymentMethod: string,
 *   pricing: { day: number, bothDays: number },
 *   tickets: object[],
 * }} params
 */
export function createTicketOrder({ event, attendees, paymentMethod, pricing, tickets }) {
  const orderId = generateId('tord', tickets.length + 1)
  const amount = attendees.reduce((sum, attendee) => sum + priceForDayPass(attendee.dayPass, pricing), 0)
  const status = getPaymentStatusForMethod(paymentMethod) === 'validacion_manual' ? 'validacion_manual' : 'pendiente'
  const reference = createPaymentReference(paymentMethod)
  const createdAt = todayISO()

  const startIndex = tickets.length
  const newTickets = attendees.map((attendee, index) => ({
    id: generateId('tkt', startIndex + index + 1),
    orderId,
    eventSlug: event.slug,
    eventTitle: event.title,
    eventDate: event.date,
    eventVenue: event.venue,
    eventLocation: event.location,
    ticketCode: buildTicketCode(startIndex + index + 1),
    attendeeName: attendee.fullName.trim(),
    attendeeDni: attendee.dni.trim(),
    dayPass: attendee.dayPass,
    paymentMethod,
    reference,
    unitPrice: priceForDayPass(attendee.dayPass, pricing),
    status: 'pendiente_pago',
    checkedInAt: null,
    createdAt,
  }))

  const createdOrder = {
    type: 'tickets',
    orderId,
    eventTitle: event.title,
    quantity: attendees.length,
    amount,
    paymentMethod,
    reference,
    status,
    createdAt,
  }

  const auditLog = {
    id: `audit-${Date.now()}`,
    action: 'tickets.created',
    entityType: 'ticket_order',
    entityId: orderId,
    actor: 'public',
    createdAt: new Date().toISOString(),
  }

  return { tickets: newTickets, createdOrder, auditLog }
}

/**
 * Marca todos los tickets de una orden como pagados (equivalente a la
 * aprobación de pago que ya existe para afiliaciones/inscripciones).
 */
export function approveTicketOrder(orderId, tickets) {
  return tickets.map((ticket) =>
    ticket.orderId === orderId && ticket.status === 'pendiente_pago'
      ? { ...ticket, status: 'pagada' }
      : ticket,
  )
}

/**
 * Check-in en la puerta: valida y marca un ticket como usado.
 * Devuelve un resultado tipado para que la UI distinga "ya usado" de
 * "no encontrado" de "no pagado" — clave para que seguridad no deje pasar
 * una entrada reusada o sin acreditar.
 * @param {string} ticketCode
 * @param {object[]} tickets
 */
export function checkInTicket(ticketCode, tickets) {
  const normalized = String(ticketCode ?? '').trim().toLowerCase()
  const ticket = tickets.find((item) => item.ticketCode.toLowerCase() === normalized)

  if (!ticket) return { outcome: 'not_found' }
  if (ticket.status === 'usada') return { outcome: 'already_used', ticket }
  if (ticket.status !== 'pagada') return { outcome: 'not_paid', ticket }

  const updatedTicket = { ...ticket, status: 'usada', checkedInAt: new Date().toISOString() }
  return { outcome: 'ok', ticket: updatedTicket }
}
