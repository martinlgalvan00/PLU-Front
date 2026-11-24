/**
 * Código que se dicta en la puerta. No reemplaza al `qr_token` opaco ni al
 * `ticket_code` correlativo (`TCK-`): es otro nombre de la misma entrada.
 * Sin I, L, O, 0 ni 1, para que "eme" y "ene" no se confundan al oído.
 */
export const TICKET_GATE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const GATE_CODE_LENGTH = 6

export function normalizeGateCode(raw) {
  const compact = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (compact.length !== GATE_CODE_LENGTH) return null
  if ([...compact].some((char) => !TICKET_GATE_CODE_ALPHABET.includes(char))) return null
  return `${compact.slice(0, 3)}-${compact.slice(3)}`
}

export function isGateCode(raw) {
  return normalizeGateCode(raw) != null
}

export function generateGateCode(random = Math.random) {
  let raw = ''
  for (let index = 0; index < GATE_CODE_LENGTH; index += 1) {
    const pick = Math.floor(random() * TICKET_GATE_CODE_ALPHABET.length)
    raw += TICKET_GATE_CODE_ALPHABET[pick]
  }
  return `${raw.slice(0, 3)}-${raw.slice(3)}`
}

/**
 * Un UUID sigue siendo el QR. Un `XXX-XXX` se cambia por el mismo `qr_token`
 * que ese QR ya tenía. Si el código no existe, no se lo trata como otra
 * credencial: no hay ingreso.
 */
export async function resolveTicketDoorCredential(raw, lookupGateCode) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const gateCode = normalizeGateCode(value)
  if (!gateCode) return value
  if (typeof lookupGateCode !== 'function') return null
  const qrToken = await lookupGateCode(gateCode)
  return qrToken ? String(qrToken) : null
}
