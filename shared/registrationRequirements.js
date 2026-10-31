import { resolveRegistrationDeclaredTotals } from './declaredMeetTotal.js'

/**
 * Campos obligatorios de una inscripción competitiva. Puro, sin I/O: lo usa el
 * cliente para frenar antes de pedir el cobro y el servidor (autoridad) para
 * rechazar el alta con el mismo criterio y los mismos textos.
 *
 * Una inscripción sin división, categoría, modalidad, categoría de peso, peso
 * corporal o máximo total no se puede ubicar en la tarima ni armar las tandas
 * (la segunda división paga el 50% sobre una selección completa), así que
 * ninguno es opcional. La modalidad tampoco se completa sola: antes, sin el
 * campo, el servidor la daba por Full Power y nadie la había elegido.
 * El máximo es el de competencia, o el de entrenamiento si es el primer torneo.
 */

export const BODYWEIGHT_KG_RANGE = Object.freeze({ min: 10, max: 250 })

export const REGISTRATION_REQUIRED_MESSAGES = Object.freeze({
  division: 'Elegí la división en la que vas a competir.',
  category: 'Elegí la categoría de competencia.',
  modalities: 'Elegí al menos una modalidad.',
  declaredWeightClass: 'Seleccioná la categoría de peso en la que vas a competir.',
  bodyweightKg: `Ingresá tu peso corporal (entre ${BODYWEIGHT_KG_RANGE.min} y ${BODYWEIGHT_KG_RANGE.max} kg).`,
})

/** Orden en que se piden los campos: el primero que falta es el que se informa. */
export const REGISTRATION_REQUIRED_FIELDS = Object.freeze([
  'division',
  'category',
  'modalities',
  'declaredWeightClass',
  'bodyweightKg',
])

export function isValidBodyweightKg(value) {
  if (value === null || value === undefined || value === '') return false
  const weight = Number(value)
  return (
    Number.isFinite(weight) && weight >= BODYWEIGHT_KG_RANGE.min && weight <= BODYWEIGHT_KG_RANGE.max
  )
}

/**
 * @param {{ division?: unknown, category?: unknown, modalities?: unknown, declaredWeightClass?: unknown, bodyweightKg?: unknown }} selection
 * @returns {{ ok: true } | { ok: false, field: string, message: string }}
 */
export function checkRequiredRegistrationFields(selection = {}) {
  for (const field of REGISTRATION_REQUIRED_FIELDS) {
    const value = selection?.[field]
    const present =
      field === 'bodyweightKg'
        ? isValidBodyweightKg(value)
        : field === 'modalities'
          ? Array.isArray(value) && value.some((item) => String(item ?? '').trim() !== '')
          : String(value ?? '').trim() !== ''
    if (!present) return { ok: false, field, message: REGISTRATION_REQUIRED_MESSAGES[field] }
  }
  const totals = resolveRegistrationDeclaredTotals(selection)
  if (!totals.ok) return { ok: false, field: totals.field, message: totals.message }
  return { ok: true }
}
