/**
 * guestListService.js — PLU ARG
 *
 * Lectura de la lista de invitados que el staff pega o importa desde una
 * planilla. Es la misma convención que `parseSecurityTeamImport`: una persona
 * por línea, columnas separadas por coma, punto y coma o tab. Acá las columnas
 * se reconocen por su forma y no por su posición, porque cada organización
 * arma la planilla como quiere ("DNI, Nombre" o "Nombre; Mail; DNI"):
 *
 *   - un campo con 7-8 dígitos (con o sin puntos) es el DNI,
 *   - un campo con @ es el email,
 *   - el resto, unido con un espacio, es el nombre ("Pérez, Ana" -> "Pérez Ana").
 *
 * La validación final la hace el servidor (y la RPC); esto sólo le muestra al
 * operador, antes de emitir, qué líneas no se van a poder cargar y por qué.
 */

export const GUEST_LIST_MAX = 200

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DNI_RE = /^\d{7,8}$/
// Encabezado típico de planilla: se descarta en vez de reportarse como error.
const HEADER_RE = /^(nombre|name|apellido|full ?name|dni|documento|email|mail)\b/i

function normalizeDni(value) {
  return String(value ?? '').replace(/[.\s-]/g, '')
}

/**
 * @param {string} raw Texto pegado o contenido del CSV.
 * @returns {{ guests: Array<{fullName: string, dni: string, email: string, line: number}>,
 *             invalid: Array<{line: number, value: string, reason: 'name'|'dni'|'email'|'duplicate'}>,
 *             truncated: boolean }}
 */
export function parseGuestList(raw) {
  const guests = []
  const invalid = []
  const seen = new Set()

  const lines = String(raw ?? '').split(/\r?\n/)
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return
    if (index === 0 && HEADER_RE.test(line) && !/\d{7}/.test(line)) return

    const parts = line
      .split(/[\t,;]/)
      .map((part) => part.trim().replace(/^"(.*)"$/, '$1').trim())
      .filter(Boolean)

    let dni = ''
    let email = ''
    let badEmail = false
    const nameParts = []
    for (const part of parts) {
      const asDni = normalizeDni(part)
      if (!dni && DNI_RE.test(asDni)) {
        dni = asDni
      } else if (part.includes('@')) {
        if (EMAIL_RE.test(part.toLowerCase())) email = part.toLowerCase()
        else badEmail = true
      } else {
        nameParts.push(part)
      }
    }
    const fullName = nameParts.join(' ').replace(/\s+/g, ' ').trim()
    const lineNumber = index + 1

    if (fullName.length < 3) {
      invalid.push({ line: lineNumber, value: line, reason: 'name' })
      return
    }
    if (!dni) {
      invalid.push({ line: lineNumber, value: line, reason: 'dni' })
      return
    }
    if (badEmail) {
      invalid.push({ line: lineNumber, value: line, reason: 'email' })
      return
    }
    if (seen.has(dni)) {
      invalid.push({ line: lineNumber, value: line, reason: 'duplicate' })
      return
    }
    seen.add(dni)
    guests.push({ fullName, dni, email, line: lineNumber })
  })

  return {
    guests: guests.slice(0, GUEST_LIST_MAX),
    invalid,
    truncated: guests.length > GUEST_LIST_MAX,
  }
}

/**
 * Estado de una invitación para el panel: dada de baja manda sobre todo; si
 * no, el ingreso registrado; si no, vigente.
 * @returns {'cancelled' | 'checked_in' | 'active'}
 */
export function guestStatus(guest) {
  if (guest?.status === 'cancelado') return 'cancelled'
  if (guest?.checkedInAt) return 'checked_in'
  return 'active'
}

export function summarizeGuests(guests = []) {
  let active = 0
  let checkedIn = 0
  for (const guest of guests) {
    const status = guestStatus(guest)
    if (status === 'cancelled') continue
    active += 1
    if (status === 'checked_in') checkedIn += 1
  }
  return { active, checkedIn }
}
