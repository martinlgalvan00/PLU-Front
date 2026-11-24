/**
 * Lo que tipea un guardia cuando el QR no se puede leer (pantalla rota, poca
 * batería, brillo bajo, una foto impresa borrosa).
 *
 * El QR lleva un token opaco (UUID) que nadie puede dictar. Lo que la persona
 * SÍ puede cantar es su código de puerta (6 dígitos al azar, `482 913`), el
 * número impreso en la entrada (`TCK-00000412`) o su DNI; el atleta, su código
 * de socio. Esta función decide qué es cada cosa sin pedirle al operador que
 * elija un tipo:
 *
 *   - URL o UUID del QR                         -> 'qr'  (el escaneo de siempre)
 *   - exactamente 6 dígitos (`482913`, `482 913`)  -> 'door_code'
 *   - `TCK-00000412`, `tck 412`, `#412`, `412`     -> 'ticket_code'
 *   - 7 u 8 dígitos, con o sin puntos              -> 'dni'
 *   - cualquier otra cosa                          -> 'member' (código de socio)
 *
 * Un número suelto de 1 a 5 dígitos es número de entrada; de 6, código de
 * puerta; de 7 u 8, DNI. Con prefijo `TCK` siempre es número de entrada.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TICKET_PREFIX_RE = /^(?:tck|tk|t)[\s#:-]*0*(\d{1,8})$/i
const SHORT_NUMBER_RE = /^#?\s*0*(\d{1,5})$/
// Los códigos se emiten entre 100000 y 999999: un 6 dígitos con 0 adelante
// (`000412`) es un número de entrada con ceros, no un código de puerta.
const DOOR_CODE_RE = /^[1-9]\d{5}$/
const DNI_RE = /^\d{7,8}$/

/** `482913` -> `482 913`: en dos grupos de tres se dicta y se escucha sin errores. */
export function formatDoorCode(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits
}

/** `412` -> `TCK-00000412`, el formato con el que se emite (ticket_code_seq). */
export function formatTicketCode(number) {
  return `TCK-${String(number).padStart(8, '0')}`
}

/**
 * @param {string} raw
 * @returns {{ kind: 'qr' } | { kind: 'door_code', doorCode: string }
 *   | { kind: 'ticket_code', ticketCode: string }
 *   | { kind: 'dni', dni: string } | { kind: 'member', code: string } | null}
 */
export function parseManualCheckinCode(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null

  if (value.includes('://') || /[?&]credencial=/i.test(value) || UUID_RE.test(value)) {
    return { kind: 'qr' }
  }

  const prefixed = value.replace(/\s+/g, ' ').match(TICKET_PREFIX_RE)
  if (prefixed && Number(prefixed[1]) > 0) {
    return { kind: 'ticket_code', ticketCode: formatTicketCode(Number(prefixed[1])) }
  }

  const digits = value.replace(/[.\s-]/g, '')
  if (DOOR_CODE_RE.test(digits)) return { kind: 'door_code', doorCode: digits }
  if (DNI_RE.test(digits)) return { kind: 'dni', dni: digits }

  const short = value.match(SHORT_NUMBER_RE)
  if (short && Number(short[1]) > 0) {
    return { kind: 'ticket_code', ticketCode: formatTicketCode(Number(short[1])) }
  }

  return { kind: 'member', code: value }
}

/** Estas formas necesitan traducirse a una credencial antes de validar. */
export function needsCheckinLookup(parsed) {
  return ['door_code', 'ticket_code', 'dni'].includes(parsed?.kind)
}

/** Cuerpo de `POST /checkin/lookup` (y de la búsqueda offline) para cada forma. */
export function checkinLookupQuery(parsed) {
  if (parsed?.kind === 'door_code') return { doorCode: parsed.doorCode }
  if (parsed?.kind === 'ticket_code') return { ticketCode: parsed.ticketCode }
  if (parsed?.kind === 'dni') return { dni: parsed.dni }
  return null
}
