import { firstEntryDayWindow, TICKET_ACCESS_POLICY_MODE } from './ticketValidityPolicy.js'
import { TICKET_VALIDITY_STATUS, ticketValidityStatus } from './ticketValidity.js'

export const HOLDER_CREDENTIAL_STATE = Object.freeze({
  LIVE: 'live',
  USED: 'used',
  EXPIRED: 'expired',
})

function validityModeOf(ticket) {
  return ticket?.qr_validity_mode ?? ticket?.qrValidityMode ?? ticket?.validityMode ?? null
}

function activatedAtOf(ticket) {
  return ticket?.access_activated_at ?? ticket?.accessActivatedAt ?? null
}

/**
 * Qué ve el dueño de la credencial.
 * Un día trabado y todavía vigente es "ya la usaste": el QR no se vuelve a mostrar.
 * El día siguiente, aunque no hayan pasado 24 horas, es "credencial vencida".
 */
export function holderCredentialState(ticket, now = new Date()) {
  const clock = now instanceof Date ? now : new Date(now)
  const mode = validityModeOf(ticket)
  const activatedAt = activatedAtOf(ticket)

  if (mode === TICKET_ACCESS_POLICY_MODE.FIRST_ENTRY_DAY && activatedAt) {
    const window = firstEntryDayWindow(activatedAt)
    if (!window) return HOLDER_CREDENTIAL_STATE.LIVE
    if (clock.getTime() >= window.validUntil.getTime()) return HOLDER_CREDENTIAL_STATE.EXPIRED
    return HOLDER_CREDENTIAL_STATE.USED
  }

  const temporal = ticketValidityStatus(
    {
      validFrom: ticket?.valid_from ?? ticket?.validFrom,
      validUntil: ticket?.valid_until ?? ticket?.validUntil,
    },
    clock,
  )
  if (temporal === TICKET_VALIDITY_STATUS.EXPIRED) return HOLDER_CREDENTIAL_STATE.EXPIRED
  return HOLDER_CREDENTIAL_STATE.LIVE
}

export function holderMayShowQr(state) {
  return state === HOLDER_CREDENTIAL_STATE.LIVE
}
