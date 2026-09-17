/**
 * Vigencia inmutable de una entrada emitida.
 *
 * La base congela `validFrom`/`validUntil` al crear el QR. El límite superior
 * es exclusivo: una entrada del Día 1 deja de valer exactamente al comenzar
 * el Día 2, aunque el tipo del catálogo se edite después.
 */

export const TICKET_VALIDITY_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  UPCOMING: 'upcoming',
  VALID: 'valid',
  EXPIRED: 'expired',
})

function timestamp(value) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function ticketValidityStatus(ticket, now = new Date()) {
  const validFrom = timestamp(ticket?.validFrom ?? ticket?.valid_from)
  const validUntil = timestamp(ticket?.validUntil ?? ticket?.valid_until)
  const current = now instanceof Date ? now.getTime() : timestamp(now)

  if (validFrom == null || validUntil == null || current == null || validUntil <= validFrom) {
    return TICKET_VALIDITY_STATUS.UNKNOWN
  }
  if (current < validFrom) return TICKET_VALIDITY_STATUS.UPCOMING
  if (current >= validUntil) return TICKET_VALIDITY_STATUS.EXPIRED
  return TICKET_VALIDITY_STATUS.VALID
}

export function ticketIsCurrentlyValid(ticket, now = new Date()) {
  const status = ticketValidityStatus(ticket, now)
  // Compatibilidad durante un deploy escalonado: una entrada vieja sin las
  // columnas todavía no se invalida sólo porque el frontend llegó primero.
  return status === TICKET_VALIDITY_STATUS.UNKNOWN || status === TICKET_VALIDITY_STATUS.VALID
}
