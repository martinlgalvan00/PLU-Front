import { apiGet, apiPost } from '../lib/api.js'

/**
 * ticketApi.js — PLU ARG
 *
 * Las entradas generales hablan con Supabase — es la parte del sistema que
 * necesita la garantía dura de "no se puede duplicar/reusar", y esa
 * garantía viene de las funciones RPC `SECURITY DEFINER` en
 * supabase/migrations/20260706030200_phase1_rpc_functions.sql (mismo
 * mecanismo que antes vivía en server/modules/ticketing/*Workflow.js).
 *
 * Supabase devuelve columnas snake_case; esta capa las normaliza a las
 * mismas claves camelCase que ya devolvía la API de Express/Prisma, para
 * no tocar los callers (mapApiTicket, useAppData.js, CredentialPage.jsx).
 * Los códigos de error personalizados se mapean en lib/rpcErrors.js
 * (compartido con athleteApi.js) al mismo `ApiError` que usaba esa API
 * vieja, por la misma razón.
 */

function toCamelEvent(row) {
  if (!row) return row
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    venue: row.venue,
    location: row.location,
    eventDate: row.starts_at,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}

function toCamelCheckIn(row) {
  if (!row) return row
  return {
    id: row.id,
    eventId: row.event_id,
    attendeeKind: row.attendee_kind,
    ticketId: row.ticket_id,
    registrationId: row.registration_id,
    gate: row.gate,
    scannedAt: row.scanned_at,
  }
}

function toCamelTicket(row, { event, checkIn } = {}) {
  if (!row) return row
  return {
    id: row.id,
    ticketCode: row.ticket_code,
    qrToken: row.qr_token,
    orderId: row.order_id,
    eventId: row.event_id,
    attendeeName: row.attendee_name,
    attendeeDni: row.attendee_dni,
    ticketTypeId: row.ticket_type_id,
    ticketTypeName: row.ticketTypeName ?? row.ticket_type_name ?? null,
    unitPrice: row.unit_price,
    addons: Array.isArray(row.addons) ? row.addons : [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    event: toCamelEvent(event),
    checkIn: toCamelCheckIn(checkIn),
  }
}

function toCamelOrder(row) {
  if (!row) return row
  return {
    id: row.id,
    eventId: row.event_id,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    reference: row.reference,
    rejectedBy: row.rejected_by ?? row.rejectedBy ?? null,
    rejectionReason: row.rejection_reason ?? row.rejectionReason ?? null,
    rejectedAt: row.rejected_at ?? row.rejectedAt ?? null,
    paymentProofPath: row.payment_proof_path?.trim?.() || row.payment_proof_path || null,
    paymentProofUploadedAt: row.payment_proof_uploaded_at,
    createdAt: row.created_at,
  }
}

export async function createTicketOrder({
  eventSlug,
  attendees,
  buyer,
  provider,
  idempotencyKey = crypto.randomUUID(),
  accessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`,
}) {
  const result = await apiPost('/api/tickets/orders', {
    eventSlug,
    attendees,
    buyer,
    provider,
    idempotencyKey,
    accessToken,
  })
  return {
    order: toCamelOrder(result.order),
    tickets: result.tickets.map((ticket) => toCamelTicket(ticket)),
    orderAccessToken: result.orderAccessToken,
  }
}

export async function approveTicketOrder(orderId) {
  const result = await apiPost(`/api/tickets/orders/${orderId}/approve`, {})
  return {
    order: toCamelOrder(result.order),
    tickets: result.tickets.map((ticket) => toCamelTicket(ticket)),
  }
}

export async function rejectTicketOrder(orderId, reason) {
  const result = await apiPost(`/api/tickets/orders/${orderId}/reject`, { reason })
  return {
    order: toCamelOrder(result.order),
    tickets: result.tickets.map((ticket) => toCamelTicket(ticket)),
  }
}

export async function registerTicketPaymentProof(orderId, accessToken, proofPath) {
  const result = await apiPost(`/api/tickets/orders/${orderId}/proof`, { accessToken, proofPath })
  return { order: toCamelOrder(result.order) }
}

function mapPendingTicketOrderRow(row) {
  const order = toCamelOrder(row.order ?? row)
  const event = row.event ?? {}
  return {
    orderId: order.id,
    reference: order.reference,
    amount: order.amount,
    status: order.status,
    provider: order.provider,
    paymentProofPath: order.paymentProofPath,
    paymentProofUploadedAt: order.paymentProofUploadedAt,
    createdAt: order.createdAt,
    eventSlug: event.slug,
    eventTitle: event.title,
    ticketCount: row.ticketCount ?? row.ticket_count ?? 0,
    attendees: row.attendees ?? [],
  }
}

export async function listPendingTicketOrders() {
  const { orders } = await apiGet('/api/tickets/orders/pending-manual')
  return { orders: orders.map(mapPendingTicketOrderRow) }
}

export async function getTicketPaymentProofUrl(orderId) {
  if (!orderId) return null
  const { url } = await apiGet(`/api/tickets/orders/${orderId}/proof-url`)
  return url
}

export async function verifyTicketByQrToken(qrToken) {
  const { ticket: result } = await apiGet(`/api/tickets/verify/${qrToken}`)
  return { ticket: toCamelTicket(result.ticket, { event: result.event, checkIn: result.checkIn }) }
}

/**
 * Disponibilidad de entradas antes de comprar (cupo evento + por día).
 * `limit: null` significa sin tope configurado. Si Supabase no está
 * disponible o el evento no tiene reglas de cupo, la UI simplemente no
 * muestra el aviso — no es un dato bloqueante para poder comprar.
 */
export async function fetchTicketAvailability(eventSlug) {
  const result = await apiGet(`/api/tickets/availability/${encodeURIComponent(eventSlug)}`)
  return {
    availability: result?.availability ?? null,
    // Interruptores de la plataforma: viajan con la disponibilidad porque la
    // pantalla de entradas necesita las dos cosas para armarse. Ausentes =
    // abiertos, para no cerrar la compra por una respuesta vieja del API.
    checkout: {
      ticketEnabled: result?.checkout?.ticketEnabled !== false,
      ticketManualEnabled: result?.checkout?.ticketManualEnabled !== false,
    },
  }
}

export async function listTicketsForEvent(eventSlug) {
  const { tickets: rows } = await apiGet(`/api/tickets?eventSlug=${encodeURIComponent(eventSlug)}`)
  return { tickets: rows.map((row) => toCamelTicket(row.ticket, { checkIn: row.checkIn })) }
}

export async function checkInTicket(qrToken, gate) {
  const result = await apiPost(`/api/tickets/checkin/${qrToken}`, { gate })
  return { ticket: toCamelTicket(result.ticket), checkIn: toCamelCheckIn(result.checkIn) }
}

export async function redeemTicketAddon(qrToken, addonId) {
  const result = await apiPost(`/api/tickets/checkin/${qrToken}/addons/${addonId}/redeem`, {})
  return {
    ticket: toCamelTicket(result.ticket, { checkIn: result.checkIn }),
  }
}

/**
 * Normaliza un ticket ya camelCase a la forma que esperan los componentes
 * (EventShareCard, TicketPurchaseSection, CheckInSection). `purchaseEvent`
 * opcional: cuando viene de una compra recién hecha, trae los textos ya
 * formateados (fecha "12 y 13 de diciembre...") en vez de la fecha ISO
 * cruda del evento.
 */
export function mapApiTicket(apiTicket, purchaseEvent) {
  return {
    id: apiTicket.id,
    orderId: apiTicket.orderId,
    ticketCode: apiTicket.ticketCode,
    qrToken: apiTicket.qrToken,
    attendeeName: apiTicket.attendeeName,
    attendeeDni: apiTicket.attendeeDni,
    ticketTypeId: apiTicket.ticketTypeId,
    ticketTypeName: apiTicket.ticketTypeName,
    unitPrice: apiTicket.unitPrice,
    addons: Array.isArray(apiTicket.addons) ? apiTicket.addons : [],
    status: apiTicket.status,
    checkedInAt: apiTicket.checkIn?.scannedAt ?? null,
    eventSlug: purchaseEvent?.slug ?? apiTicket.event?.slug,
    eventTitle: purchaseEvent?.title ?? apiTicket.event?.title,
    eventDate: purchaseEvent?.date ?? apiTicket.event?.eventDate,
    eventVenue: purchaseEvent?.venue ?? apiTicket.event?.venue,
    eventLocation: purchaseEvent?.location ?? apiTicket.event?.location,
  }
}
