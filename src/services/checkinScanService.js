import { ApiError } from '../lib/api.js'
import { mapApiTicket, verifyTicketByQrToken } from './ticketApi.js'

/** Estado sintético unificado para atletas (pagos) y tickets (ciclo de entrada). */
export function registrationCheckinStatus(registration) {
  if (registration.checkedInAt) return 'usada'
  if (registration.status === 'confirmada') return 'pagada'
  return registration.status
}

function buildAthleteRow(registration, athlete) {
  return {
    id: `reg-${registration.id}`,
    registrationId: registration.id,
    type: 'atleta',
    name: athlete?.fullName,
    document: athlete?.documentId,
    meta: [registration.category, registration.division].filter(Boolean).join(' · '),
    day: 'both',
    status: registrationCheckinStatus(registration),
    checkedInAt: registration.checkedInAt,
  }
}

export function buildTicketRow(ticket) {
  return {
    id: `tkt-${ticket.id}`,
    ticketCode: ticket.ticketCode,
    qrToken: ticket.qrToken,
    type: 'espectador',
    name: ticket.attendeeName,
    document: ticket.attendeeDni,
    meta: ticket.ticketCode,
    day: ticket.dayPass,
    status: ticket.checkedInAt ? 'usada' : ticket.status,
    checkedInAt: ticket.checkedInAt,
    addons: ticket.addons ?? [],
  }
}

function checkinOutcomeFromStatus(status) {
  if (status === 'usada') return 'already_used'
  if (status === 'pagada') return 'ready'
  return 'not_ready'
}

export function resolveRegistrationScan({ code, eventSlug }, ctx) {
  const { athletes, memberships, registrations, defaultEventSlug } = ctx
  const slug = eventSlug || defaultEventSlug

  const membership = memberships.find(
    (item) => (item.memberCode ?? '').toLowerCase() === (code ?? '').toLowerCase(),
  )
  if (!membership) return { kind: 'registration', outcome: 'not_found' }

  const athlete = athletes.find((item) => item.id === membership.athleteId)
  if (!athlete) return { kind: 'registration', outcome: 'not_found' }

  const registration = registrations.find(
    (item) => item.athleteId === athlete.id && item.eventSlug === slug && item.status !== 'cancelada',
  )
  if (!registration) {
    return { kind: 'registration', outcome: 'no_registration', athlete, membership }
  }

  const status = registrationCheckinStatus(registration)
  const outcome = checkinOutcomeFromStatus(status)

  return {
    kind: 'registration',
    outcome,
    canCheckIn: outcome === 'ready',
    athlete,
    membership,
    registration,
    registrationId: registration.id,
    status,
    row: buildAthleteRow(registration, athlete),
  }
}

export async function resolveTicketScan(qrToken) {
  try {
    const { ticket } = await verifyTicketByQrToken(qrToken)
    const mapped = mapApiTicket(ticket)
    const status = mapped.checkedInAt ? 'usada' : mapped.status
    const outcome = checkinOutcomeFromStatus(status)

    return {
      kind: 'ticket',
      outcome,
      canCheckIn: outcome === 'ready',
      ticket: mapped,
      qrToken,
      status,
      row: buildTicketRow(mapped),
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { kind: 'ticket', outcome: 'not_found' }
    }
    throw error
  }
}

/**
 * Resuelve un escaneo QR a atleta inscripto o entrada general.
 * @param {{ code: string, eventSlug: string | null, type: string | null }} parsed
 */
export async function resolveCredentialScan(parsed, ctx) {
  if (!parsed?.code) return { outcome: 'invalid' }

  if (parsed.type === 'ticket') {
    return resolveTicketScan(parsed.code)
  }

  const registrationResult = resolveRegistrationScan(parsed, ctx)
  if (registrationResult.outcome !== 'not_found') {
    return registrationResult
  }

  return resolveTicketScan(parsed.code)
}
