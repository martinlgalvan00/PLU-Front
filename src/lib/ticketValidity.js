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

/**
 * Margen operativo para puerta. No modifica la validez: sólo avisa a
 * Seguridad que un QR que hoy habilita podría dejar de hacerlo durante la
 * interacción. La barrera autoritativa sigue siendo `validUntil` exclusivo.
 */
export const TICKET_VALIDITY_WARNING_MS = 15 * 60 * 1000

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

/**
 * Contexto temporal para una decisión de puerta. Se calcula sobre el snapshot
 * inmutable de la entrada, no sobre el tipo de ticket actual. De este modo se
 * puede mostrar “vence en 4 min” o “venció hace 1 min” sin abrir ninguna vía
 * de gracia: `remainingMs = 0` ya es vencido.
 */
export function ticketValidityTiming(ticket, now = new Date(), warningMs = TICKET_VALIDITY_WARNING_MS) {
  const validFrom = timestamp(ticket?.validFrom ?? ticket?.valid_from)
  const validUntil = timestamp(ticket?.validUntil ?? ticket?.valid_until)
  const current = now instanceof Date ? now.getTime() : timestamp(now)
  const status = ticketValidityStatus(ticket, now)

  if (current == null || validFrom == null || validUntil == null) {
    return { status, startsInMs: null, remainingMs: null, expiredForMs: null, isExpiringSoon: false }
  }

  if (status === TICKET_VALIDITY_STATUS.UPCOMING) {
    return {
      status,
      startsInMs: Math.max(0, validFrom - current),
      remainingMs: null,
      expiredForMs: null,
      isExpiringSoon: false,
    }
  }
  if (status === TICKET_VALIDITY_STATUS.EXPIRED) {
    return {
      status,
      startsInMs: null,
      remainingMs: 0,
      expiredForMs: Math.max(0, current - validUntil),
      isExpiringSoon: false,
    }
  }
  if (status === TICKET_VALIDITY_STATUS.VALID) {
    const remainingMs = Math.max(0, validUntil - current)
    return {
      status,
      startsInMs: null,
      remainingMs,
      expiredForMs: null,
      isExpiringSoon: remainingMs <= Math.max(0, Number(warningMs) || 0),
    }
  }
  return { status, startsInMs: null, remainingMs: null, expiredForMs: null, isExpiringSoon: false }
}

export function ticketIsCurrentlyValid(ticket, now = new Date()) {
  const status = ticketValidityStatus(ticket, now)
  // Compatibilidad durante un deploy escalonado: una entrada vieja sin las
  // columnas todavía no se invalida sólo porque el frontend llegó primero.
  return status === TICKET_VALIDITY_STATUS.UNKNOWN || status === TICKET_VALIDITY_STATUS.VALID
}
