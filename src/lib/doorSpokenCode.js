import { parseCredentialScan } from './credentialQr.js'
import { TICKET_GATE_CODE_ALPHABET, normalizeGateCode } from './ticketGateCode.js'

/**
 * Lo que se canta en la puerta es el `gate_code` que ya existe: seis signos
 * XXX-XXX, sin I, L, O, 0 ni 1. Acá sólo se entiende la frase y se la deja
 * en esa forma. La validez, el offline y el ingreso siguen el mismo camino
 * que el QR.
 */

const SPOKEN = Object.freeze({
  a: 'A',
  be: 'B',
  b: 'B',
  ce: 'C',
  c: 'C',
  de: 'D',
  d: 'D',
  e: 'E',
  efe: 'F',
  f: 'F',
  ge: 'G',
  g: 'G',
  hache: 'H',
  h: 'H',
  jota: 'J',
  j: 'J',
  ka: 'K',
  k: 'K',
  eme: 'M',
  m: 'M',
  ene: 'N',
  n: 'N',
  pe: 'P',
  p: 'P',
  cu: 'Q',
  q: 'Q',
  erre: 'R',
  ere: 'R',
  r: 'R',
  ese: 'S',
  s: 'S',
  te: 'T',
  t: 'T',
  u: 'U',
  ve: 'V',
  uve: 'V',
  v: 'V',
  w: 'W',
  equis: 'X',
  x: 'X',
  ye: 'Y',
  y: 'Y',
  zeta: 'Z',
  z: 'Z',
  dos: '2',
  two: '2',
  tres: '3',
  three: '3',
  cuatro: '4',
  four: '4',
  cinco: '5',
  five: '5',
  seis: '6',
  six: '6',
  siete: '7',
  seven: '7',
  ocho: '8',
  eight: '8',
  nueve: '9',
  nine: '9',
})

const FILLER = new Set([
  'codigo',
  'code',
  'entrada',
  'puerta',
  'guion',
  'coma',
  'punto',
  'por',
  'favor',
  'el',
  'la',
  'los',
  'es',
])

const FORBIDDEN = new Set(['i', 'ele', 'elle', 'o', 'cero', 'zero', 'oh', 'uno', 'una', 'un', 'one'])

const SPOKEN_NAMES = Object.freeze({
  A: 'a',
  B: 'be',
  C: 'ce',
  D: 'de',
  E: 'e',
  F: 'efe',
  G: 'ge',
  H: 'hache',
  J: 'jota',
  K: 'ka',
  M: 'eme',
  N: 'ene',
  P: 'pe',
  Q: 'cu',
  R: 'erre',
  S: 'ese',
  T: 'te',
  U: 'u',
  V: 've',
  W: 'doble ve',
  X: 'equis',
  Y: 'ye',
  Z: 'zeta',
  2: 'dos',
  3: 'tres',
  4: 'cuatro',
  5: 'cinco',
  6: 'seis',
  7: 'siete',
  8: 'ocho',
  9: 'nueve',
})

function stripInvisibles(value) {
  return String(value ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '')
}

function fold(value) {
  return stripInvisibles(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function preparePhrase(value) {
  return fold(value)
    .replace(/\bi griega\b/g, ' ye ')
    .replace(/\bdoble ve\b/g, ' w ')
    .replace(/\bdoble uve\b/g, ' w ')
    .replace(/\bdoble u\b/g, ' w ')
}

/**
 * Mientras se tipea un código corto, lo muestra como XXX-XXX.
 * Una URL, una frase o un TCK- se dejan como vienen.
 */
export function formatManualScanInput(value) {
  const raw = stripInvisibles(value)
  if (raw.includes('://') || /credencial=/i.test(raw)) return raw
  if (/[a-z]{2,}/i.test(raw) && !normalizeGateCode(raw)) return raw
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  if (!compact) return raw.trim()
  if (compact.length <= 3) return compact
  return `${compact.slice(0, 3)}-${compact.slice(3)}`
}

export function gateCodeUtterance(code) {
  const normalized = normalizeGateCode(code)
  if (!normalized) return ''
  const words = [...normalized.replace('-', '')].map((char) => SPOKEN_NAMES[char] ?? char)
  return `${words.slice(0, 3).join(' ')}. ${words.slice(3).join(' ')}`
}

export function publicSpokenName(name) {
  const first = String(name ?? '')
    .trim()
    .split(/\s+/)[0]
  if (!first || /\d/.test(first)) return ''
  return first
}

function interpretSpokenGateCode(raw) {
  const tokens = preparePhrase(raw)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (tokens.length === 0) return null

  let recognized = false
  let forbidden = false
  let unknown = false
  let symbols = ''

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (FILLER.has(token)) continue
    if (FORBIDDEN.has(token)) {
      forbidden = true
      recognized = true
      continue
    }
    if (token === 'doble' || token === 'triple' || token === 'double') {
      const next = tokens[index + 1]
      const symbol = SPOKEN[next]
      if (!symbol) {
        unknown = true
        continue
      }
      symbols += symbol.repeat(token === 'triple' ? 3 : 2)
      recognized = true
      index += 1
      continue
    }
    if (SPOKEN[token]) {
      symbols += SPOKEN[token]
      recognized = true
      continue
    }
    if (/^\d+$/.test(token) && [...token].every((digit) => TICKET_GATE_CODE_ALPHABET.includes(digit))) {
      symbols += token
      recognized = true
      continue
    }
    unknown = true
  }

  if (!recognized) return null
  if (forbidden) return { kind: 'malformed', reason: 'ambiguous', heard: symbols.length }
  if (unknown || symbols.length !== 6) {
    return { kind: 'malformed', reason: 'length', heard: symbols.length }
  }
  if ([...symbols].some((char) => !TICKET_GATE_CODE_ALPHABET.includes(char))) {
    return { kind: 'malformed', reason: 'ambiguous', heard: symbols.length }
  }
  return {
    kind: 'door',
    display: `${symbols.slice(0, 3)}-${symbols.slice(3)}`,
    repairs: ['speech'],
  }
}

export function prepareCheckinScan(raw) {
  const cleaned = stripInvisibles(raw).trim()
  if (!cleaned) return { kind: 'empty', raw: '' }
  if (cleaned.includes('://') || /credencial=/i.test(cleaned)) {
    return { kind: 'credential', raw: cleaned, parsed: parseCredentialScan(cleaned) }
  }

  const gate = normalizeGateCode(cleaned)
  if (gate) {
    return {
      kind: 'door',
      raw: cleaned,
      display: gate,
      repairs: cleaned === gate ? [] : ['formatted'],
    }
  }

  const spoken = interpretSpokenGateCode(cleaned)
  if (spoken?.kind === 'door') return { ...spoken, raw: cleaned }
  if (spoken?.kind === 'malformed') return { ...spoken, raw: cleaned, repairs: ['speech'] }

  const compact = fold(cleaned).replace(/[^a-z0-9]/g, '')
  if (compact.length === 6 && [...compact].some((char) => 'ilo01'.includes(char))) {
    return { kind: 'malformed', raw: cleaned, reason: 'ambiguous', heard: 6, repairs: [] }
  }

  return { kind: 'credential', raw: cleaned, parsed: parseCredentialScan(cleaned) }
}
