import { SPONSOR_TIERS } from '../data/sponsors.js'

/** Alcances que puede elegir la marca. `undecided` es el valor por defecto. */
export const SPONSOR_SCOPES = Object.freeze(['season', 'event', 'undecided'])

/** Valor del selector de nivel cuando la marca no sabe cuál le conviene. */
export const SPONSOR_TIER_UNDECIDED = 'undecided'

/** Etiquetas fijas del mail que recibe el equipo (interno, siempre en español). */
const SCOPE_LABELS = Object.freeze({
  season: 'Temporada completa',
  event: 'Un meet puntual',
  undecided: 'Sin definir',
})

const TIER_LABELS = Object.freeze({
  title: 'Title sponsor',
  official: 'Partner oficial',
  support: 'Apoyo operativo',
  [SPONSOR_TIER_UNDECIDED]: 'A definir juntos',
})

export function isSponsorScope(value) {
  return SPONSOR_SCOPES.includes(value)
}

export function isSponsorTier(value) {
  return SPONSOR_TIERS.includes(value)
}

/** Normaliza un nivel desconocido al valor "a definir" para no romper el selector. */
export function normalizeSponsorTier(value) {
  return isSponsorTier(value) ? value : SPONSOR_TIER_UNDECIDED
}

/**
 * Arma el cuerpo del mensaje que viaja por `/api/contact` con motivo `sponsor`.
 * La ruta solo conoce name / email / message, así que la estructura de la
 * propuesta viaja como texto legible para quien la recibe.
 *
 * @param {{ brand: string, scope: string, tier: string, contribution?: string }} input
 * @returns {string}
 */
export function buildSponsorInquiryMessage({ brand, scope, tier, contribution = '' }) {
  const lines = [
    `Marca: ${brand.trim()}`,
    `Alcance: ${SCOPE_LABELS[isSponsorScope(scope) ? scope : 'undecided']}`,
    `Nivel de interés: ${TIER_LABELS[normalizeSponsorTier(tier)]}`,
  ]
  const detail = contribution.trim()
  if (detail) lines.push('', 'Qué puede aportar:', detail)
  return lines.join('\n')
}
