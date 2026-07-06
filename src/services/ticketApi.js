import { ApiError } from '../lib/api.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

/**
 * ticketApi.js — PLU ARG
 *
 * A diferencia del resto del dominio (atletas/membresías/inscripciones,
 * que siguen viviendo en localStorage), las entradas generales hablan con
 * Supabase — es la parte del sistema que necesita la garantía dura de "no
 * se puede duplicar/reusar", y esa garantía viene de las funciones RPC
 * `SECURITY DEFINER` en supabase/migrations/20260706030200_phase1_rpc_functions.sql
 * (mismo mecanismo que antes vivía en server/modules/ticketing/*Workflow.js).
 *
 * Supabase devuelve columnas snake_case; esta capa las normaliza a las
 * mismas claves camelCase que ya devolvía la API de Express/Prisma, para
 * no tocar los callers (mapApiTicket, useAppData.js, CredentialPage.jsx).
 * Los códigos de error personalizados (PLU01..PLU06) se mapean acá al
 * mismo `ApiError` que usaba esa API vieja, por la misma razón.
 */

const ERROR_STATUS_BY_CODE = {
  PLU02: 404, // no encontrado (evento/orden/entrada/inscripción)
  PLU06: 409, // ya usado (check-in duplicado)
  PLU05: 409, // no pagada / cancelada
}

function throwAsApiError(error) {
  const status = ERROR_STATUS_BY_CODE[error.code] ?? 400
  throw new ApiError(error.message, {
    status,
    body: { alreadyUsed: error.code === 'PLU06', detail: error.details ?? undefined },
  })
}

async function callRpc(fn, args) {
  if (!isSupabaseConfigured || !supabase) {
    throw new ApiError(
      'Supabase no está configurado. Agregá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env.',
      { status: 503 },
    )
  }

  const { data, error } = await supabase.rpc(fn, args)
  if (error) throwAsApiError(error)
  return data
}

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
    dayPass: row.day_pass,
    unitPrice: row.unit_price,
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
    createdAt: row.created_at,
  }
}

function toCamelRegistration(row) {
  if (!row) return row
  return {
    id: row.id,
    athleteId: row.athlete_id,
    eventId: row.event_id,
    division: row.division,
    category: row.category,
    bodyweightKg: row.bodyweight_kg,
    status: row.status,
  }
}

export async function createTicketOrder({ eventSlug, attendees, buyer, provider }) {
  const result = await callRpc('create_ticket_order', {
    p_event_slug: eventSlug,
    p_attendees: attendees,
    p_buyer: { ...buyer, provider },
  })
  return {
    order: toCamelOrder(result.order),
    tickets: result.tickets.map((ticket) => toCamelTicket(ticket)),
  }
}

export async function approveTicketOrder(orderId) {
  const result = await callRpc('approve_ticket_order', { p_order_id: orderId })
  return {
    order: toCamelOrder(result.order),
    tickets: result.tickets.map((ticket) => toCamelTicket(ticket)),
  }
}

export async function verifyTicketByQrToken(qrToken) {
  const result = await callRpc('get_ticket_by_qr_token', { p_qr_token: qrToken })
  return { ticket: toCamelTicket(result.ticket, { event: result.event, checkIn: result.checkIn }) }
}

export async function listTicketsForEvent(eventSlug) {
  const rows = await callRpc('list_tickets_for_event', { p_event_slug: eventSlug })
  return { tickets: rows.map((row) => toCamelTicket(row.ticket, { checkIn: row.checkIn })) }
}

export async function checkInTicket(qrToken, gate) {
  const result = await callRpc('check_in_ticket', { p_qr_token: qrToken, p_gate: gate })
  return { ticket: toCamelTicket(result.ticket), checkIn: toCamelCheckIn(result.checkIn) }
}

export async function checkInRegistration(registrationId, gate) {
  const result = await callRpc('check_in_registration', {
    p_registration_id: registrationId,
    p_gate: gate,
  })
  return {
    registration: toCamelRegistration(result.registration),
    checkIn: toCamelCheckIn(result.checkIn),
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
