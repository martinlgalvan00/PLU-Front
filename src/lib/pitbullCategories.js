/**
 * Reglas de lectura de las categorías de Pitbull para el film de la página.
 * Se leen del nombre que carga el contenido (no de su posición en la lista),
 * así editar el copy o reordenarlo no descuadra las escenas.
 */

export const LIFT_KEYS = ['squat', 'bench', 'deadlift']

/**
 * Levantamientos que incluye una modalidad:
 * · Full Power → sentadilla, banco plano y peso muerto.
 * · Push-Pull → banco plano y peso muerto.
 * · Especialista en X → solo X.
 *
 * @param {string} name
 * @returns {Array<'squat'|'bench'|'deadlift'>}
 */
export function liftsForModality(name) {
  const text = String(name).toLowerCase()
  if (/push|pull/.test(text)) return ['bench', 'deadlift']
  if (/sentadilla|squat/.test(text)) return ['squat']
  if (/banca|banco|bench/.test(text)) return ['bench']
  if (/muerto|dead/.test(text)) return ['deadlift']
  return [...LIFT_KEYS]
}

/**
 * Tipo de equipamiento:
 * · raw → rodilleras, muñequeras y cinturón.
 * · raw-wraps → lo mismo, con vendas en lugar de rodilleras.
 * · single / multi / open → capas de equipo (una, varias, sin restricción).
 *
 * @param {string} name
 * @returns {'raw'|'raw-wraps'|'single'|'multi'|'open'}
 */
export function gearKind(name) {
  const text = String(name).toLowerCase()
  if (/raw/.test(text)) return /venda|wrap/.test(text) ? 'raw-wraps' : 'raw'
  if (/single/.test(text)) return 'single'
  if (/multi/.test(text)) return 'multi'
  return 'open'
}

/** Piezas de cada tipo de equipamiento, en el orden en que se dibujan. */
export const GEAR_SETS = {
  raw: ['kneeSleeves', 'wristWraps', 'belt'],
  'raw-wraps': ['kneeWraps', 'wristWraps', 'belt'],
}
