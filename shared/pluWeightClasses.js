/**
 * Clases de peso de Powerlifting United.
 * Misma lista que el reglamento navegable (`src/data/rulebook/es.json`).
 * El valor canónico usa coma decimal (`67,5`) y `140+` para la clase abierta.
 */

export const WOMEN_WEIGHT_CLASSES = Object.freeze([
  '44',
  '48',
  '52',
  '56',
  '60',
  '67,5',
  '75',
  '82,5',
  '90',
  '100',
  '110',
  '125',
  '140',
  '140+',
])

export const MEN_WEIGHT_CLASSES = Object.freeze([
  '52',
  '56',
  '60',
  '67,5',
  '75',
  '82,5',
  '90',
  '100',
  '110',
  '125',
  '140',
  '140+',
])

const ALL_WEIGHT_CLASSES = new Set([...WOMEN_WEIGHT_CLASSES, ...MEN_WEIGHT_CLASSES])

function sexKey(sex) {
  const value = String(sex ?? '').trim().toLowerCase()
  if (value === 'masculino' || value === 'male' || value === 'm' || value === 'hombre') return 'men'
  if (value === 'femenino' || value === 'female' || value === 'f' || value === 'mujer') return 'women'
  return ''
}

/** `67.5 kg` / `67,50` → `67,5`. Vacío si no es una clase del reglamento. */
export function canonicalDeclaredWeightClass(value) {
  const compact = String(value ?? '')
    .trim()
    .replace(/\s*kg$/i, '')
    .replace(/\s+/g, '')
    .replace('.', ',')
  if (!compact) return ''
  const trimmed = compact.includes(',')
    ? compact.replace(/,(\d*?)0+$/, ',$1').replace(/,$/, '')
    : compact
  if (ALL_WEIGHT_CLASSES.has(trimmed)) return trimmed
  if (ALL_WEIGHT_CLASSES.has(compact)) return compact
  return ''
}

/**
 * Clase que va al archivo del torneo.
 * Si organización ya confirmó el pesaje, manda la oficial.
 * Si no, sigue la declarada en la inscripción.
 */
/** Peso que va al archivo: el del pesaje si ya se cargó; si no, el declarado. */
export function competitionBodyweight(registration) {
  const weighIn = registration?.weighInBodyweight ?? registration?.weigh_in_bodyweight_kg
  if (weighIn != null && String(weighIn).trim() !== '') return weighIn
  return registration?.bodyweight ?? registration?.bodyweight_kg ?? registration?.bodyweightKg ?? ''
}

export function competitionWeightClass(registration) {
  const official = String(
    registration?.officialWeightClass ?? registration?.official_weight_class ?? '',
  ).trim()
  const declared = String(
    registration?.declaredWeightClass ?? registration?.declared_weight_class ?? '',
  ).trim()
  return official || declared
}

export function weightClassLabelsForSex(sex) {
  const key = sexKey(sex)
  if (key === 'men') return MEN_WEIGHT_CLASSES
  if (key === 'women') return WOMEN_WEIGHT_CLASSES
  return []
}

export function isDeclaredWeightClassForSex(sex, value) {
  const canonical = canonicalDeclaredWeightClass(value)
  if (!canonical) return false
  return weightClassLabelsForSex(sex).includes(canonical)
}

function numericBodyweight(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim().replace(/\s*kg$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(raw)) return null
  const weight = Number(raw)
  return Number.isFinite(weight) ? weight : null
}

/** Tope en kg de la clase. `140+` no tiene tope. */
export function weightClassCeilingKg(declaredWeightClass) {
  const canonical = canonicalDeclaredWeightClass(declaredWeightClass)
  if (!canonical || canonical.endsWith('+')) return null
  const ceiling = Number(canonical.replace(',', '.'))
  return Number.isFinite(ceiling) ? ceiling : null
}

/**
 * Clase en la que entraría el peso, según el reglamento.
 * No se aplica sola: el atleta puede declarar otra.
 */
export function suggestWeightClass(sex, bodyweight) {
  const labels = weightClassLabelsForSex(sex)
  const weight = numericBodyweight(bodyweight)
  if (!labels.length || weight == null) return ''
  for (const label of labels) {
    if (label.endsWith('+')) return label
    const ceiling = weightClassCeilingKg(label)
    if (ceiling != null && weight <= ceiling) return label
  }
  return labels.at(-1) ?? ''
}

/**
 * Advertencia informativa. No corrige la categoría.
 * Solo avisa cuando el peso supera el tope de la clase.
 */
export function getWeightClassWarning(bodyweight, declaredWeightClass, options = {}) {
  const ceiling = weightClassCeilingKg(declaredWeightClass)
  const weight = numericBodyweight(bodyweight)
  if (ceiling == null || weight == null || weight <= ceiling) return null
  return {
    code: 'BODYWEIGHT_OVER_CLASS',
    message:
      options.source === 'weigh-in'
        ? 'El peso del pesaje supera la categoría seleccionada.'
        : 'El peso corporal declarado supera la categoría seleccionada.',
  }
}
