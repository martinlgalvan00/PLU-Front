/**
 * Lo que tipea un guardia cuando el QR no se puede leer y la persona tampoco
 * tiene a mano su código de puerta (`gate_code`, XXX-XXX: ese lo interpreta
 * `prepareCheckinScan` en doorSpokenCode.js, con reparación de lo dictado).
 *
 * Esta función cubre las otras dos cosas que alguien siempre puede decir:
 *
 *   - el número impreso de su compra: `TCK-00000412`, `tck 412`, `#412`, `412`
 *     -> 'ticket_code'
 *   - su DNI (7 u 8 dígitos, con o sin puntos) -> 'dni'
 *
 * Las dos se traducen a la(s) credencial(es) del evento con
 * `POST /api/tickets/checkin/lookup` y después siguen por el carril del
 * escaneo, así pago, vigencia, zona y uso único se validan igual que con la
 * cámara. Un DNI puede dar varias (entrenador, o entrada + inscripción).
 *
 * Un número suelto de 1 a 5 dígitos es número de entrada; de 7 u 8, DNI. Con
 * prefijo `TCK` siempre es número de entrada. Todo lo demás -> null (sigue el
 * flujo de siempre).
 */

const TICKET_PREFIX_RE = /^(?:tck|tk|t)[\s#:-]*0*(\d{1,8})$/i
const SHORT_NUMBER_RE = /^#?\s*0*(\d{1,5})$/
const DNI_RE = /^\d{7,8}$/

/** `412` -> `TCK-00000412`, el formato con el que se emite (ticket_code_seq). */
export function formatTicketCode(number) {
  return `TCK-${String(number).padStart(8, '0')}`
}

/**
 * @param {string} raw
 * @returns {{ kind: 'ticket_code', ticketCode: string } | { kind: 'dni', dni: string } | null}
 */
export function parseManualCheckinCode(raw) {
  const value = String(raw ?? '').trim()
  if (!value || value.includes('://') || /[?&]credencial=/i.test(value)) return null

  const prefixed = value.replace(/\s+/g, ' ').match(TICKET_PREFIX_RE)
  if (prefixed && Number(prefixed[1]) > 0) {
    return { kind: 'ticket_code', ticketCode: formatTicketCode(Number(prefixed[1])) }
  }

  const digits = value.replace(/[.\s-]/g, '')
  if (DNI_RE.test(digits)) return { kind: 'dni', dni: digits }

  const short = value.match(SHORT_NUMBER_RE)
  if (short && Number(short[1]) > 0) {
    return { kind: 'ticket_code', ticketCode: formatTicketCode(Number(short[1])) }
  }

  return null
}

/** Estas formas se traducen a una credencial antes de validar. */
export function needsCheckinLookup(parsed) {
  return parsed?.kind === 'ticket_code' || parsed?.kind === 'dni'
}

/** Cuerpo de `POST /checkin/lookup` (y de la búsqueda offline) para cada forma. */
export function checkinLookupQuery(parsed) {
  if (parsed?.kind === 'ticket_code') return { ticketCode: parsed.ticketCode }
  if (parsed?.kind === 'dni') return { dni: parsed.dni }
  return null
}
