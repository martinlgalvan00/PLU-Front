/**
 * Selección competitiva de una inscripción: divisiones y modalidades.
 * Puro, sin I/O: lo comparten el formulario (preview) y la API (autoridad).
 *
 * Reglas de negocio (PLU §1.3):
 * · Todos pueden anotarse en Open; el resto de las divisiones depende de la edad.
 * · Se puede competir en dos divisiones a la vez. La primera (la de la franja de
 *   edad) se paga al 100% y la segunda (Open) al 50%. Quien solo elige Open paga 100%.
 * · La modalidad es Full Power (por defecto) o especialidades (Push-Pull,
 *   sentadilla, banco, peso muerto), en cualquier combinación. La primera va
 *   incluida y cada una más suma el 50% (decisión de oct 2026). Lo único que se
 *   evita es lo redundante: Push-Pull ya incluye banco y peso muerto.
 * · Los recargos se suman sobre la base, no se componen: Junior + Open +
 *   Full Power + Banco = 100% + 50% + 50%. En Submission se repiten por cada
 *   categoría elegida (cada una es una participación completa).
 */

import {
  allowedCompetitionDivisions,
  normalizeCompetitionDivision,
  todayCalendarDate,
} from './ageDivision.js'
import { EQUIPMENT_TYPES } from './competitionLexicon.js'

/** La segunda división paga esta fracción del precio de la primera. */
export const SECOND_DIVISION_PRICE_RATIO = 0.5

/** Cada modalidad además de la primera paga esta fracción del precio base. */
export const EXTRA_MODALITY_PRICE_RATIO = 0.5

export const REGISTRATION_MODALITIES = Object.freeze([
  'full_power',
  'push_pull',
  'squat',
  'bench',
  'deadlift',
])

export const REGISTRATION_CATEGORIES = Object.freeze([...EQUIPMENT_TYPES])

const FULL_POWER = 'full_power'

/**
 * Deja la división de edad como primera y Open como segunda. Una segunda igual
 * a la primera, vacía o desconocida se descarta.
 * @returns {{ primary: string, secondary: string }}
 */
export function normalizeDivisionSelection({ division = '', secondaryDivision = '' } = {}) {
  const first = normalizeCompetitionDivision(division)
  const second = normalizeCompetitionDivision(secondaryDivision)
  if (!second || second === first) return { primary: first, secondary: '' }
  if (!first) return { primary: second, secondary: '' }
  // Open no es "la división de edad": siempre va como segunda.
  return first === 'Open'
    ? { primary: second, secondary: 'Open' }
    : { primary: first, secondary: second }
}

/**
 * @returns {{ ok: true, primary: string, secondary: string }
 *   | { ok: false, code: 'DIVISION_INVALID'|'DIVISION_AGE_MISMATCH', allowed?: string[], primary: string, secondary: string }}
 */
export function validateDivisionSelection({
  division = '',
  secondaryDivision = '',
  birthDate = null,
  referenceDate = undefined,
} = {}) {
  const requestedSecond = String(secondaryDivision ?? '').trim()
  const { primary, secondary } = normalizeDivisionSelection({ division, secondaryDivision })

  // Una división que no existe nunca es válida, aunque no haya fecha de nacimiento.
  if (!primary || (requestedSecond && !normalizeCompetitionDivision(requestedSecond))) {
    return { ok: false, code: 'DIVISION_INVALID', primary, secondary }
  }

  if (birthDate) {
    const allowed = allowedCompetitionDivisions(birthDate, referenceDate || todayCalendarDate())
    const chosen = [primary, secondary].filter(Boolean)
    if (!chosen.every((item) => allowed.includes(item))) {
      return { ok: false, code: 'DIVISION_AGE_MISMATCH', allowed, primary, secondary }
    }
  }
  return { ok: true, primary, secondary }
}

/** Recargo por la segunda división, en pesos enteros. */
export function secondDivisionSurcharge(basePrice) {
  const price = Number(basePrice)
  if (!Number.isFinite(price) || price <= 0) return 0
  return Math.round(price * SECOND_DIVISION_PRICE_RATIO)
}

/** Modalidades que se cobran aparte: todas menos la primera (que va incluida). */
export function extraModalityCount(input) {
  return Math.max(0, normalizeModalities(input).length - 1)
}

/** Recargo por las modalidades extra, en pesos enteros: 50% de la base por cada una. */
export function extraModalitySurcharge(basePrice, modalities) {
  const price = Number(basePrice)
  if (!Number.isFinite(price) || price <= 0) return 0
  return Math.round(price * EXTRA_MODALITY_PRICE_RATIO) * extraModalityCount(modalities)
}

/** Cuántas categorías se cobran (Submission admite varias; mínimo una). */
export function registrationCategoryCount(input) {
  const raw = Array.isArray(input) ? input : input ? [input] : []
  const selected = new Set(raw.map((item) => String(item ?? '').trim()))
  return Math.max(1, REGISTRATION_CATEGORIES.filter((item) => selected.has(item)).length)
}

/** Lista canónica de categorías, sin repetidos ni valores fuera del catálogo. */
export function normalizeRegistrationCategories(input) {
  const raw = Array.isArray(input) ? input : input ? [input] : []
  const selected = new Set(raw.map((item) => String(item ?? '').trim()))
  return REGISTRATION_CATEGORIES.filter((item) => selected.has(item))
}

/**
 * Importes a cobrar para la selección: precio de lista (Mercado Pago / Wise) y
 * precio del canal manual, cada uno con sus propios recargos.
 *
 * Por categoría: base + 50% si suma Open + 50% por cada modalidad extra, todos
 * sobre la base. En Submission cada categoría es una participación completa,
 * así que todo se multiplica por la cantidad de categorías.
 *
 * `surcharge` / `manualSurcharge` son los de la segunda división (nombre
 * histórico); los de modalidad van en `modalitySurcharge` / `manualModalitySurcharge`.
 * Sin `modalities` no hay recargo por modalidad (compat con quien no la manda).
 */
export function priceRegistrationSelection({
  basePrice,
  manualPrice = null,
  secondary = '',
  categoryCount = 1,
  modalities = [],
} = {}) {
  const multiplier = Math.max(1, Number(categoryCount) || 1)
  const hasSecond = Boolean(secondary)
  const base = Number(basePrice) * multiplier
  const surcharge = hasSecond ? secondDivisionSurcharge(base) : 0
  const modalitySurcharge = extraModalitySurcharge(base, modalities)
  const hasManual = manualPrice !== null && manualPrice !== undefined
  const manualBase = hasManual ? Number(manualPrice) * multiplier : null
  const manualSurcharge = hasSecond && hasManual ? secondDivisionSurcharge(manualBase) : 0
  const manualModalitySurcharge = hasManual ? extraModalitySurcharge(manualBase, modalities) : 0
  return {
    defaultPrice: base + surcharge + modalitySurcharge,
    manualPrice: hasManual ? manualBase + manualSurcharge + manualModalitySurcharge : null,
    surcharge,
    manualSurcharge,
    modalitySurcharge,
    manualModalitySurcharge,
  }
}

/** Lista limpia, sin repetidos ni desconocidos, en el orden canónico del catálogo. */
export function normalizeModalities(input) {
  const list = Array.isArray(input) ? input : input ? [input] : []
  const chosen = new Set(list.map((item) => String(item ?? '').trim()))
  return REGISTRATION_MODALITIES.filter((item) => chosen.has(item))
}

/**
 * @returns {{ ok: true, modalities: string[] }
 *   | { ok: false, code: 'MODALITY_REQUIRED'|'MODALITY_INVALID'|'MODALITY_COMBINATION_INVALID' }}
 */
export function validateModalities(input) {
  const raw = (Array.isArray(input) ? input : input ? [input] : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
  if (raw.length === 0) return { ok: false, code: 'MODALITY_REQUIRED' }
  if (raw.some((item) => !REGISTRATION_MODALITIES.includes(item))) {
    return { ok: false, code: 'MODALITY_INVALID' }
  }
  const modalities = normalizeModalities(raw)
  // Push-Pull es banco + peso muerto: sumarlos es pagar dos veces lo mismo.
  if (
    modalities.includes('push_pull') &&
    (modalities.includes('bench') || modalities.includes('deadlift'))
  ) {
    return { ok: false, code: 'MODALITY_COMBINATION_INVALID' }
  }
  return { ok: true, modalities }
}

/**
 * Selección que viaja a la API, armada desde los campos del formulario:
 * `division`, `secondaryDivision` (vacío u 'Open') y `modalities` (lista).
 * Sin `modalities` en el formulario (formulario viejo) compite Full Power.
 */
export function selectionFromForm(form = {}) {
  const modalities = Array.isArray(form.modalities)
    ? normalizeModalities(form.modalities)
    : [FULL_POWER]
  return {
    division: String(form.division ?? '').trim(),
    secondaryDivision: String(form.secondaryDivision ?? '').trim(),
    modalities,
  }
}

/**
 * Casillas de división → campos de la inscripción. La división de edad (si se
 * marca) es la primera y paga el 100%; Open es la segunda. Open sola es la
 * primera.
 */
export function divisionsFromChoices({ natural = '', age = false, open = false } = {}) {
  const hasAge = Boolean(age) && Boolean(natural)
  if (hasAge && natural === 'Open') return { division: 'Open', secondaryDivision: '' }
  if (hasAge && open) return { division: natural, secondaryDivision: 'Open' }
  if (hasAge) return { division: natural, secondaryDivision: '' }
  if (open) return { division: 'Open', secondaryDivision: '' }
  return { division: '', secondaryDivision: '' }
}

/** Inverso de `divisionsFromChoices`: qué casillas representan la selección guardada. */
export function choicesFromDivisions({ division = '', secondaryDivision = '' } = {}, natural = '') {
  const first = String(division ?? '').trim()
  const second = String(secondaryDivision ?? '').trim()
  const open = first === 'Open' || second === 'Open'
  const age = Boolean(first) && first !== 'Open' ? true : Boolean(natural) && first === natural
  return { age, open }
}

/**
 * Marca o desmarca una modalidad. Push-Pull ya incluye banco y peso muerto, así
 * que elegir uno de los tres saca a los otros en vez de dejar elegir una
 * combinación que se rechaza. Puede quedar vacía: la validación pide una.
 */
export function toggleModality(current, value) {
  const chosen = new Set(normalizeModalities(current))
  if (chosen.has(value)) {
    chosen.delete(value)
  } else {
    chosen.add(value)
    if (value === 'push_pull') {
      chosen.delete('bench')
      chosen.delete('deadlift')
    } else if (value === 'bench' || value === 'deadlift') {
      chosen.delete('push_pull')
    }
  }
  return normalizeModalities([...chosen])
}

const MODALITY_LABELS = Object.freeze({
  full_power: 'Full Power',
  push_pull: 'Push-Pull',
  squat: 'Sentadilla',
  bench: 'Banco',
  deadlift: 'Peso muerto',
})

/** "Full Power + Banco": legible para planillas y paneles (sin i18n). */
export function formatModalities(input) {
  const list = normalizeModalities(input?.length ? input : ['full_power'])
  return list.map((item) => MODALITY_LABELS[item]).join(' + ')
}
