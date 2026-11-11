/**
 * Lo que se canta en la puerta cuando el QR de la credencial no se lee.
 * El número de socio sigue siendo `PLU-ARG-2026-00000865`. Acá se queda
 * el año (dos dígitos) y el serial sin ceros: `26 865`.
 * La puerta prueba el serial de 8 dígitos, el de 3 y el pelado, porque
 * las afiliaciones viejas no usan el mismo relleno.
 */

const MEMBER_CODE = /^PLU-ARG-(\d{4})-(\d+)$/i
const SEPARATED = /^(\d{2}|\d{4})[\s.\-·]+(\d{1,8})$/

const DIGITS_ES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
const DIGITS_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

function normalizeParts(yearRaw, serialRaw) {
  const yearText = String(yearRaw ?? '')
  const yearNum = Number(yearText)
  const yearFull = yearText.length === 2 ? 2000 + yearNum : yearNum
  if (!Number.isInteger(yearFull) || yearFull < 2020 || yearFull > 2039) return null
  const serial = String(serialRaw ?? '').replace(/^0+/, '') || '0'
  if (!/^\d{1,8}$/.test(serial)) return null
  const yearShort = String(yearFull).slice(-2)
  return {
    yearFull: String(yearFull),
    yearShort,
    serial,
    display: `${yearShort} ${serial}`,
  }
}

/**
 * `26 865`, `26-865`, `2026 865` o `26865`.
 * Seis dígitos pegados se dejan para el código de entrada (XXX-XXX).
 * @param {string} raw
 * @returns {{ yearFull: string, yearShort: string, serial: string, display: string } | null}
 */
export function parseSpokenMemberInput(raw) {
  const text = String(raw ?? '').trim()
  if (!text || /[a-z]/i.test(text)) return null

  const separated = text.match(SEPARATED)
  if (separated) return normalizeParts(separated[1], separated[2])

  const digits = text.replace(/[^\d]/g, '')
  if (!digits || digits !== text.replace(/[\s.\-·]/g, '')) return null
  if (digits.length === 6) return null
  if (digits.length >= 6 && digits.startsWith('20')) {
    const serial = digits.slice(4)
    if (serial) return normalizeParts(digits.slice(0, 4), serial)
  }
  if (digits.length >= 3 && digits.length <= 10) {
    return normalizeParts(digits.slice(0, 2), digits.slice(2))
  }
  return null
}

/**
 * Códigos que la credencial ya acepta, del formato vigente al histórico.
 * Un `PLU-ARG-…` se deja como está.
 * @param {string} raw
 * @returns {string[]}
 */
export function memberCodeLookupCandidates(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return []
  const exact = value.match(MEMBER_CODE)
  if (exact) return [`PLU-ARG-${exact[1]}-${exact[2]}`]
  const spoken = parseSpokenMemberInput(value)
  if (!spoken) return [value]
  return [
    ...new Set([
      `PLU-ARG-${spoken.yearFull}-${spoken.serial.padStart(8, '0')}`,
      `PLU-ARG-${spoken.yearFull}-${spoken.serial.padStart(3, '0')}`,
      `PLU-ARG-${spoken.yearFull}-${spoken.serial}`,
    ]),
  ]
}

/**
 * @param {string | null | undefined} memberCode
 * @param {'es' | 'en'} [locale]
 * @returns {{ display: string, compact: string, utterance: string, canonical: string } | null}
 */
export function spokenMemberCode(memberCode, locale = 'es') {
  const match = String(memberCode ?? '').trim().match(MEMBER_CODE)
  if (!match) return null
  const parsed = normalizeParts(match[1].slice(-2), match[2])
  if (!parsed) return null
  const names = locale === 'en' ? DIGITS_EN : DIGITS_ES
  const say = (digits) => [...digits].map((digit) => names[Number(digit)] ?? digit).join(' ')
  return {
    display: parsed.display,
    compact: `${parsed.yearShort}${parsed.serial}`,
    utterance: `${say(parsed.yearShort)}, ${say(parsed.serial)}`,
    canonical: `PLU-ARG-${parsed.yearFull}-${parsed.serial.padStart(8, '0')}`,
  }
}
