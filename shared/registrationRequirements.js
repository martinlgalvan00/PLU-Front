/**
 * Campos obligatorios de una inscripción competitiva. Puro, sin I/O: lo usa el
 * cliente para frenar antes de pedir el cobro y el servidor (autoridad) para
 * rechazar el alta con el mismo criterio y los mismos textos.
 *
 * Una inscripción sin división, categoría, categoría de peso o peso corporal no
 * se puede ubicar en la tarima ni cobrar bien (la segunda división paga el 50%
 * sobre una selección completa), así que ninguno es opcional.
 */

export const BODYWEIGHT_KG_RANGE = Object.freeze({ min: 10, max: 250 })

export const REGISTRATION_REQUIRED_MESSAGES = Object.freeze({
  division: 'Elegí la división en la que vas a competir.',
  category: 'Elegí la categoría de competencia.',
  declaredWeightClass: 'Seleccioná la categoría de peso en la que vas a competir.',
  bodyweightKg: `Ingresá tu peso corporal (entre ${BODYWEIGHT_KG_RANGE.min} y ${BODYWEIGHT_KG_RANGE.max} kg).`,
})

/** Orden en que se piden los campos: el primero que falta es el que se informa. */
export const REGISTRATION_REQUIRED_FIELDS = Object.freeze([
  'division',
  'category',
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
 * @param {{ division?: unknown, category?: unknown, declaredWeightClass?: unknown, bodyweightKg?: unknown }} selection
 * @returns {{ ok: true } | { ok: false, field: string, message: string }}
 */
export function checkRequiredRegistrationFields(selection = {}) {
  for (const field of REGISTRATION_REQUIRED_FIELDS) {
    const value = selection?.[field]
    const present =
      field === 'bodyweightKg' ? isValidBodyweightKg(value) : String(value ?? '').trim() !== ''
    if (!present) return { ok: false, field, message: REGISTRATION_REQUIRED_MESSAGES[field] }
  }
  return { ok: true }
}
