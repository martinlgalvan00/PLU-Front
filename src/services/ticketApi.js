import { ApiError, apiGet, apiPost } from '../lib/api.js'
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
    paymentProofPath: row.payment_proof_path,
    paymentProofUploadedAt: row.payment_proof_uploaded_at,
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
  try {
    const result = await callRpc('approve_ticket_order', { p_order_id: orderId })
    return {
      order: toCamelOrder(result.order),
      tickets: result.tickets.map((ticket) => toCamelTicket(ticket)),
    }
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 42501].includes(error.status)) {
      const result = await apiPost(`/api/tickets/orders/${orderId}/approve`, {})
      return {
        order: {
          id: result.order.id,
          eventId: result.order.eventId,
          amount: result.order.amount,
          provider: result.order.provider,
          status: result.order.status,
          reference: result.order.reference,
          paymentProofPath: result.order.paymentProofPath,
          paymentProofUploadedAt: result.order.paymentProofUploadedAt,
          createdAt: result.order.createdAt,
        },
        tickets: result.tickets.map((ticket) => ({
          id: ticket.id,
          ticketCode: ticket.ticketCode,
          qrToken: ticket.qrToken,
          orderId: ticket.orderId,
          attendeeName: ticket.attendeeName,
          attendeeDni: ticket.attendeeDni,
          dayPass: ticket.dayPass,
          status: ticket.status,
        })),
      }
    }
    throw error
  }
}

export async function registerTicketPaymentProof(orderId, proofPath) {
  try {
    const result = await callRpc('register_ticket_payment_proof', {
      p_order_id: orderId,
      p_proof_path: proofPath,
    })
    return { order: toCamelOrder(result.order) }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 503) throw error
    return apiPost(`/api/tickets/orders/${orderId}/proof`, { proofPath })
  }
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
  try {
    const { orders } = await apiGet('/api/tickets/orders/pending-manual')
    return {
      orders: orders.map((row) => ({
        orderId: row.order.id,
        reference: row.order.reference,
        amount: row.order.amount,
        status: row.order.status,
        provider: row.order.provider,
        paymentProofPath: row.order.paymentProofPath,
        paymentProofUploadedAt: row.order.paymentProofUploadedAt,
        createdAt: row.order.createdAt,
        eventSlug: row.event?.slug,
        eventTitle: row.event?.title,
        ticketCount: row.ticketCount,
        attendees: row.attendees ?? [],
      })),
    }
  } catch (error) {
    if (!(error instanceof ApiError) || ![401, 403].includes(error.status)) {
      if (!isSupabaseConfigured || !supabase) throw error
    }
  }

  const rows = await callRpc('list_pending_ticket_orders', {})
  const list = Array.isArray(rows) ? rows : []
  return { orders: list.map(mapPendingTicketOrderRow) }
}

export async function getTicketPaymentProofUrl(orderId) {
  if (!orderId) return null
  const { url } = await apiGet(`/api/tickets/orders/${orderId}/proof-url`)
  return url
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

export async function redeemTicketAddon(qrToken, addonId) {
  try {
    const result = await callRpc('redeem_ticket_addon', {
      p_qr_token: qrToken,
      p_addon_id: addonId,
    })
    return {
      ticket: toCamelTicket(result.ticket, { checkIn: result.checkIn }),
    }
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 42501].includes(error.status)) {
      const result = await apiPost(`/api/tickets/checkin/${qrToken}/addons/${addonId}/redeem`, {})
      return {
        ticket: toCamelTicket(result.ticket, { checkIn: result.ticket?.checkIn }),
      }
    }
    throw error
  }
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
