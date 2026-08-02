import { ApiError } from '../lib/api.js'
import { getMembershipByCodeOrToken, getStaffMembershipCredential } from './athleteApi.js'
import { mapApiTicket, verifyTicketByQrToken } from './ticketApi.js'

/** Estado sintético unificado para atletas (pagos) y tickets (ciclo de entrada). */
export function registrationCheckinStatus(registration) {
  if (registration.checkedInAt) return 'usada'
  if (registration.status === 'confirmada') return 'pagada'
  return registration.status
}

function buildAthleteRow(registration, athlete, membership) {
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
    membershipStatus: membership?.status ?? null,
  }
}

function buildMembershipOnlyRow(athlete, membership) {
  return {
    id: `mem-${membership.id}`,
    type: 'atleta',
    name: athlete?.fullName,
    document: athlete?.documentId,
    meta: '',
    day: 'both',
    status: null,
    membershipStatus: membership?.status ?? null,
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
    meta: ticket.ticketTypeName ?? ticket.ticketCode,
    ticketTypeName: ticket.ticketTypeName,
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

/**
 * El operador en la puerta necesita el DNI para cotejarlo contra el documento
 * físico, pero la proyección pública dejó de exponerlo (el `member_code` es
 * correlativo, así que devolver PII ahí era una fuga enumerable). Con sesión
 * de staff se pide por la API autenticada; sin sesión se cae a la pública, que
 * es la que consume la página de verificación del QR.
 */
function readCredential(code, slug, staff) {
  if (!staff) return getMembershipByCodeOrToken(code, slug)
  return getStaffMembershipCredential(code, slug).catch((error) => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      return getMembershipByCodeOrToken(code, slug)
    }
    throw error
  })
}

export async function resolveRegistrationScan({ code, eventSlug }, ctx) {
  const { defaultEventSlug, staff = false } = ctx
  const slug = eventSlug || defaultEventSlug

  try {
    const { athlete, membership, registration } = await readCredential(code, slug, staff)
    if (!membership || !athlete) return { kind: 'registration', outcome: 'not_found' }

    if (!registration) {
      return {
        kind: 'registration',
        outcome: 'no_registration',
        athlete,
        membership,
        row: buildMembershipOnlyRow(athlete, membership),
      }
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
      row: buildAthleteRow(registration, athlete, membership),
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { kind: 'registration', outcome: 'not_found' }
    }
    throw error
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

  const registrationResult = await resolveRegistrationScan(parsed, ctx)
  if (registrationResult.outcome !== 'not_found') {
    return registrationResult
  }

  return resolveTicketScan(parsed.code)
}
