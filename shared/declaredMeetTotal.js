/**
 * Máximo total declarado al inscribirse.
 *
 * Quien ya compitió declara el mejor total de competencia (sentadilla + banco +
 * peso muerto). Quien hace su primer torneo no tiene ese número: declara el
 * máximo que levanta entrenando. Los dos no conviven en la misma inscripción;
 * el perfil puede conservar el otro para la próxima.
 *
 * El rango es el mismo que `athletes.declared_best_total_kg` (10 a 2.000 kg).
 */

export const DECLARED_TOTAL_KG_RANGE = Object.freeze({ min: 10, max: 2000 })

export const DECLARED_TOTAL_MESSAGES = Object.freeze({
  competitionBestTotalKg:
    'Ingresá tu máximo total en competencia (entre 10 y 2.000 kg).',
  trainingBestTotalKg: 'Ingresá tu máximo total entrenando (entre 10 y 2.000 kg).',
})

/** Vacío → null. Texto que no es un número → NaN. Acepta "625,5 kg". */
export function parseDeclaredTotalKg(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  const raw = String(value).trim().replace(/\s*kg$/i, '').replace(',', '.')
  if (!raw) return null
  if (!/^\d+(\.\d+)?$/.test(raw)) return Number.NaN
  return Number(raw)
}

export function isValidDeclaredTotalKg(value) {
  const total = typeof value === 'number' ? value : parseDeclaredTotalKg(value)
  const { min, max } = DECLARED_TOTAL_KG_RANGE
  return Number.isFinite(total) && total >= min && total <= max
}

/** Vacío → null. Válido → kg con dos decimales. Inválido → null. */
export function optionalDeclaredTotalKg(value) {
  if (!isValidDeclaredTotalKg(value)) return null
  const total = typeof value === 'number' ? value : parseDeclaredTotalKg(value)
  return Math.round(total * 100) / 100
}

function roundKg(total) {
  return Math.round(total * 100) / 100
}

/**
 * Al marcar o desmarcar "primer torneo", el número que ya está escrito no
 * desaparece: si el campo que pasa a verse está vacío, hereda el otro.
 * No pisa un valor que ya estaba en el destino.
 *
 * @param {{ competition?: unknown, training?: unknown, firstMeet?: unknown }} input
 * @returns {{ firstMeet: boolean, competition: unknown, training: unknown }}
 */
export function carryDeclaredTotalOnModeChange(input = {}) {
  const competition = input.competition ?? ''
  const training = input.training ?? ''
  const competitionText = String(competition).trim()
  const trainingText = String(training).trim()
  const firstMeet = input.firstMeet === true || input.firstMeet === 'true'
  if (firstMeet && !trainingText && competitionText) {
    return { firstMeet: true, competition, training: competitionText }
  }
  if (!firstMeet && !competitionText && trainingText) {
    return { firstMeet: false, competition: trainingText, training }
  }
  return { firstMeet, competition, training }
}

/**
 * La inscripción guarda un solo total: el de competencia, o el de entrenamiento
 * si `firstMeet` es verdadero.
 *
 * @returns {{ ok: true, isFirstMeet: boolean, competitionBestTotalKg: number|null, trainingBestTotalKg: number|null }
 *   | { ok: false, field: 'competitionBestTotalKg'|'trainingBestTotalKg', message: string }}
 */
export function resolveRegistrationDeclaredTotals(input = {}) {
  const firstMeet = input.firstMeet === true || input.firstMeet === 'true'
  const field = firstMeet ? 'trainingBestTotalKg' : 'competitionBestTotalKg'
  const parsed = parseDeclaredTotalKg(input[field])
  if (!isValidDeclaredTotalKg(parsed)) {
    return { ok: false, field, message: DECLARED_TOTAL_MESSAGES[field] }
  }
  const total = roundKg(parsed)
  return {
    ok: true,
    isFirstMeet: firstMeet,
    competitionBestTotalKg: firstMeet ? null : total,
    trainingBestTotalKg: firstMeet ? total : null,
  }
}

/**
 * Lo que se muestra y se exporta de una inscripción ya guardada.
 * `null` si esa inscripción es anterior a este dato.
 *
 * @returns {{ kg: number, source: 'competition'|'training', firstMeet: boolean } | null}
 */
export function registrationDeclaredTotalView(registration) {
  if (!registration || registration.isFirstMeet == null) return null
  const firstMeet = registration.isFirstMeet === true
  const kg = Number(firstMeet ? registration.trainingBestTotalKg : registration.competitionBestTotalKg)
  if (!Number.isFinite(kg)) return null
  return { kg, source: firstMeet ? 'training' : 'competition', firstMeet }
}
