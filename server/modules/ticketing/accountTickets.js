import { lookupTicketAccessDays } from '../../../src/lib/buyerTicketDays.js'
import { resolveTicketRevealLeadMinutes, ticketRevealState } from '../../../src/lib/ticketReveal.js'
import { readAthleteSession, ATHLETE_SESSION_COOKIE_NAME } from '../../services/athleteSessionService.js'
import { readSessionFromRequest } from '../../services/sessionService.js'

/**
 * Misma regla que la columna generada `tickets.attendee_document_key`:
 * mayúsculas, sólo letras y números. `12.345.678` y `12345678` coinciden.
 */
export function documentKey(value) {
  const key = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return key || null
}

/**
 * Una orden vieja, sin dueño, sólo la reclama el mail verificado de la cuenta.
 * El staff no reclama por mail: su compra nueva queda con `buyer_staff_user_id`.
 */
export function legacyEmailClaim(account) {
  if (account?.kind !== 'athlete' || !account.emailVerified) return null
  const email = String(account.email ?? '').trim().toLowerCase()
  return email || null
}

function presentOrderMeta(order) {
  return {
    reference: order?.reference ?? null,
    status: order?.status ?? null,
    eventTitle: order?.event?.title ?? order?.eventTitle ?? null,
    eventSlug: order?.event?.slug ?? order?.eventSlug ?? null,
    eventStartsAt: order?.event?.starts_at ?? order?.eventStartsAt ?? null,
    eventVenue: order?.event?.venue ?? order?.eventVenue ?? null,
  }
}

function presentTicket(ticket, paid, leadMinutes) {
  const reveal = paid ? ticketRevealState(ticket, leadMinutes) : { sealed: false, revealAt: null }
  const visible = paid && !reveal.sealed
  return {
    id: ticket.id,
    order_id: ticket.order_id ?? ticket.orderId ?? null,
    bundle_id: ticket.bundle_id ?? ticket.bundleId ?? null,
    ticket_code: visible ? (ticket.ticket_code ?? ticket.ticketCode ?? null) : null,
    qr_token: visible ? (ticket.qr_token ?? ticket.qrToken ?? null) : null,
    gate_code: visible ? (ticket.gate_code ?? ticket.gateCode ?? null) : null,
    pass_sealed: Boolean(paid && reveal.sealed),
    reveal_at: paid ? reveal.revealAt : null,
    attendee_name: ticket.attendee_name ?? ticket.attendeeName ?? null,
    attendee_dni: ticket.attendee_dni ?? ticket.attendeeDni ?? null,
    status: ticket.status ?? null,
    credential_label: ticket.credential_label ?? ticket.credentialLabel ?? null,
    credential_scopes: ticket.credential_scopes ?? ticket.credentialScopes ?? [],
    is_primary_credential: ticket.is_primary_credential ?? ticket.isPrimaryCredential ?? true,
    addons: Array.isArray(ticket.addons) ? ticket.addons : [],
    valid_from: ticket.valid_from ?? ticket.validFrom ?? null,
    valid_until: ticket.valid_until ?? ticket.validUntil ?? null,
    access_days: lookupTicketAccessDays(ticket),
    ticket_type_name: ticket.ticket_types?.name ?? ticket.ticket_type_name ?? ticket.ticketTypeName ?? null,
  }
}

/**
 * El comprador ve todas las entradas de su orden. El asistente, sólo la suya.
 * El QR viaja únicamente si la orden está acreditada. El mail del comprador
 * no sale en ninguna de las dos vistas.
 */
export function serializeAccountTickets({ buyerOrders = [], attendeeTickets = [] } = {}) {
  return {
    orders: buyerOrders.map(({ order, tickets }) => {
      const paid = order?.status === 'aprobado'
      const leadMinutes = resolveTicketRevealLeadMinutes(order?.event ?? order)
      return {
        role: 'buyer',
        order: presentOrderMeta(order),
        tickets: (tickets ?? []).map((ticket) => presentTicket(ticket, paid, leadMinutes)),
      }
    }),
    attendeeTickets: attendeeTickets.map(({ order, ticket }) => {
      const paid = order?.status === 'aprobado'
      const leadMinutes = resolveTicketRevealLeadMinutes(order?.event ?? order)
      return {
        role: 'attendee',
        order: presentOrderMeta(order),
        ticket: presentTicket(ticket, paid, leadMinutes),
      }
    }),
  }
}

async function readAthleteTicketIdentity(supabase, athleteId) {
  const result = await supabase
    .from('athletes')
    .select('id, email, document_id, email_verified_at')
    .eq('id', athleteId)
    .maybeSingle()
  if (result?.error || !result?.data?.id) return null
  const row = result.data
  return {
    kind: 'athlete',
    id: row.id,
    email: row.email ? String(row.email).trim().toLowerCase() : null,
    emailVerified: Boolean(row.email_verified_at),
    documentKeys: [documentKey(row.document_id)].filter(Boolean),
  }
}

async function staffDocumentKeys(prisma, userId) {
  if (typeof prisma?.user?.findUnique !== 'function') return []
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { person: { select: { documents: { select: { documentNumber: true } } } } },
    })
    return (user?.person?.documents ?? []).map((doc) => documentKey(doc.documentNumber)).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * La cookie es la identidad. Si hay sesión de atleta y de staff, manda la
 * de atleta: Mi cuenta es esa. Sin cookie válida no hay cuenta.
 */
export async function resolveTicketAccount({ req, prisma, supabase }) {
  const athleteToken = req.cookies?.[ATHLETE_SESSION_COOKIE_NAME]
  if (supabase && athleteToken) {
    const session = await readAthleteSession({ client: supabase, token: athleteToken })
    if (session?.athleteId) {
      return readAthleteTicketIdentity(supabase, session.athleteId)
    }
  }

  if (!prisma) return null
  const staff = await readSessionFromRequest({ prisma, req })
  if (!staff?.user?.id) return null
  return {
    kind: 'staff',
    id: staff.user.id,
    email: staff.user.email ? String(staff.user.email).trim().toLowerCase() : null,
    emailVerified: false,
    documentKeys: await staffDocumentKeys(prisma, staff.user.id),
  }
}
