import { ApiError } from '../lib/api.js'
import { credentialOpensZone } from './securityZoneService.js'
import { getMembershipByCodeOrToken, getStaffMembershipCredential } from './athleteApi.js'
import { mapApiTicket, verifyTicketByQrToken } from './ticketApi.js'
import { TICKET_VALIDITY_STATUS, ticketValidityStatus } from '../lib/ticketValidity.js'

/**
 * Código PLU del rechazo del servidor → outcome de escaneo. El código es la
 * fuente de verdad: antes se adivinaba con una regex sobre el mensaje en
 * español (`no habilita esta zona`), y todo lo que no matcheara caía en "sin
 * pago" — un QR vencido rechazado por el servidor se le mostraba al operador
 * en la puerta como si la entrada no tuviera el pago acreditado.
 */
const CHECKIN_REJECTION_OUTCOME_BY_CODE = Object.freeze({
  PLU06: 'already_used',
  PLU14: 'not_yet_valid',
  PLU15: 'expired',
  PLU16: 'wrong_zone',
})

/** Clasifica el rechazo de `POST /api/tickets/checkin/:qrToken` por código PLU. */
export function checkinRejectionOutcome(error) {
  const code = error?.body?.code
  if (code && CHECKIN_REJECTION_OUTCOME_BY_CODE[code]) {
    return CHECKIN_REJECTION_OUTCOME_BY_CODE[code]
  }
  if (error?.body?.alreadyUsed) return 'already_used'
  return 'not_paid'
}

/** Estado sintético unificado para atletas (pagos) y tickets (ciclo de entrada). */
export function registrationCheckinStatus(registration) {
  if (registration.checkedInAt) return 'usada'
  if (registration.status === 'confirmada') return 'pagada'
  return registration.status
}

/**
 * Días en los que esa persona figura. Sin grilla asignada devuelve 'all': un
 * atleta todavía sin día tiene que seguir apareciendo en la puerta, no
 * desaparecer del roster hasta que la organización arme el reparto.
 */
export function scheduleDayIndexes(schedule) {
  return typeof schedule?.dayIndex === 'number' ? [schedule.dayIndex] : 'all'
}

function buildAthleteRow(registration, athlete, membership) {
  return {
    id: `reg-${registration.id}`,
    registrationId: registration.id,
    type: 'atleta',
    name: athlete?.fullName,
    document: athlete?.documentId,
    meta: [registration.category, registration.division].filter(Boolean).join(' · '),
    dayIndexes: scheduleDayIndexes(registration.schedule),
    schedule: registration.schedule ?? null,
    status: registrationCheckinStatus(registration),
    checkedInAt: registration.checkedInAt,
    membershipStatus: membership?.status ?? null,
  }
}

function buildMembershipOnlyRow(athlete, membership) {
  return {
    // La afiliación puede no existir (evento sin `requires_membership`), así
    // que la fila se identifica por la persona, que siempre está.
    id: `ath-${athlete.id}`,
    type: 'atleta',
    name: athlete?.fullName,
    document: athlete?.documentId,
    meta: '',
    dayIndexes: 'all',
    schedule: null,
    status: null,
    membershipStatus: membership?.status ?? null,
  }
}

/** Lo que ve la puerta: credencial concreta, no un rótulo genérico. */
export function checkinTypeLabel(row, t) {
  if (row?.type === 'atleta') return t('admin.checkin.athlete')
  return row?.credentialLabel || t('admin.checkin.spectator')
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
    ticketTypeDescription: ticket.ticketTypeDescription ?? null,
    // Qué credencial es, no sólo de qué tipo de entrada salió. Una compra de
    // entrenador emite dos con el mismo nombre y el mismo DNI: sin esto, en la
    // puerta son indistinguibles.
    credentialLabel: ticket.credentialLabel ?? null,
    credentialScopes: ticket.credentialScopes ?? [],
    status: ticket.checkedInAt ? 'usada' : ticket.status,
    checkedInAt: ticket.checkedInAt,
    addons: ticket.addons ?? [],
    validFrom: ticket.validFrom ?? null,
    validUntil: ticket.validUntil ?? null,
  }
}

function checkinOutcomeFromStatus(status) {
  if (status === 'usada') return 'already_used'
  if (status === 'pagada') return 'ready'
  return 'not_ready'
}

/**
 * El canje en el servidor ya rechaza zona incorrecta. El escaneo también
 * tiene que decirlo: si no, la puerta lee "habilitado" y recién falla al
 * tocar Registrar ingreso.
 */
export function applyTicketZoneOutcome(resolved, zoneScope) {
  if (resolved?.kind !== 'ticket' || resolved.outcome !== 'ready') return resolved
  const scopes = resolved.row?.credentialScopes ?? resolved.ticket?.credentialScopes
  if (credentialOpensZone(scopes, zoneScope)) return resolved
  return { ...resolved, outcome: 'wrong_zone', canCheckIn: false }
}

export function canAdmitCheckinRow(row, { canCheckIn = false, zoneScope = null } = {}) {
  if (!canCheckIn || row?.status !== 'pagada') return false
  if (row.type === 'atleta') return true
  const validity = ticketValidityStatus(row)
  if (validity === TICKET_VALIDITY_STATUS.UPCOMING || validity === TICKET_VALIDITY_STATUS.EXPIRED) {
    return false
  }
  return credentialOpensZone(row.credentialScopes, zoneScope)
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
    // La afiliación dejó de ser condición para que la credencial exista: un
    // atleta inscripto y pagado a un evento con `requires_membership = false`
    // no tiene fila en `memberships`, y exigirla acá lo hacía rebotar en la
    // puerta como "credencial no encontrada". Lo único imprescindible es que el
    // código resuelva a alguien.
    if (!athlete) return { kind: 'registration', outcome: 'not_found' }

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

export async function resolveTicketScan(qrToken, { zoneScope } = {}) {
  try {
    const { ticket } = await verifyTicketByQrToken(qrToken)
    const mapped = mapApiTicket(ticket)
    const status = mapped.checkedInAt ? 'usada' : mapped.status
    const validity = ticketValidityStatus(mapped)
    const unavailableToday = mapped.validityStatus === 'not_available_today'
    const outcome =
      status === 'pagada' && (validity === TICKET_VALIDITY_STATUS.UPCOMING || unavailableToday)
        ? 'not_yet_valid'
        : status === 'pagada' && validity === TICKET_VALIDITY_STATUS.EXPIRED
          ? 'expired'
          : checkinOutcomeFromStatus(status)

    return applyTicketZoneOutcome(
      {
        kind: 'ticket',
        outcome,
        canCheckIn: outcome === 'ready',
        ticket: mapped,
        qrToken,
        status,
        validity,
        row: buildTicketRow(mapped),
      },
      zoneScope,
    )
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
export async function resolveCredentialScan(parsed, ctx = {}) {
  if (!parsed?.code) return { outcome: 'invalid' }

  if (parsed.type === 'ticket') {
    return resolveTicketScan(parsed.code, ctx)
  }

  const registrationResult = await resolveRegistrationScan(parsed, ctx)
  if (registrationResult.outcome !== 'not_found') {
    return registrationResult
  }

  return resolveTicketScan(parsed.code, ctx)
}
