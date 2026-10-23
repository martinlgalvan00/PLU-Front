/**
 * Qué ofrece cada evento — PLU ARG
 *
 * Un meet no siempre abre todo: puede ser solo Raw, solo Full Power, sin
 * Youth… El staff elige qué ofrece (`events.rules.offering`) y tanto el
 * formulario de inscripción como la API respetan esa lista. Puro, sin I/O.
 *
 * Ausente = ofrece todo, así los eventos existentes no cambian. Solo se guarda
 * lo que se aparta de "todo" (`offeringForStorage`): un valor nuevo del
 * catálogo se ofrece por defecto en los eventos que no lo excluyeron.
 */

import { COMPETITION_DIVISIONS } from './ageDivision.js'
import { EQUIPMENT_TYPES } from './competitionLexicon.js'
import { REGISTRATION_MODALITIES } from './registrationSelection.js'

export const EVENT_OFFERING_CATEGORIES = Object.freeze([...EQUIPMENT_TYPES])
export const EVENT_OFFERING_DIVISIONS = Object.freeze([...COMPETITION_DIVISIONS])
export const EVENT_OFFERING_MODALITIES = Object.freeze([...REGISTRATION_MODALITIES])

const CATALOG = {
  categories: EVENT_OFFERING_CATEGORIES,
  divisions: EVENT_OFFERING_DIVISIONS,
  modalities: EVENT_OFFERING_MODALITIES,
}

/** Subconjunto válido en orden canónico; vacío o inválido = todo el catálogo. */
function pick(raw, catalog) {
  const chosen = new Set(Array.isArray(raw) ? raw.map((item) => String(item ?? '').trim()) : [])
  const subset = catalog.filter((item) => chosen.has(item))
  return subset.length > 0 ? subset : [...catalog]
}

/** Forma canónica: tres listas siempre completas, con Open siempre ofrecida. */
export function normalizeEventOffering(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const divisions = pick(source.divisions, EVENT_OFFERING_DIVISIONS)
  // Todos pueden anotarse en Open (PLU §1.3): no se puede apagar.
  const withOpen = EVENT_OFFERING_DIVISIONS.filter(
    (division) => division === 'Open' || divisions.includes(division),
  )
  return {
    categories: pick(source.categories, EVENT_OFFERING_CATEGORIES),
    divisions: withOpen,
    modalities: pick(source.modalities, EVENT_OFFERING_MODALITIES),
  }
}

export function offeringFromRules(rules) {
  return normalizeEventOffering(rules?.offering)
}

export function isDefaultOffering(offering) {
  return Object.keys(CATALOG).every((key) => offering[key].length === CATALOG[key].length)
}

/** Lo que se persiste: solo las listas que excluyen algo. */
export function offeringForStorage(offering) {
  const normalized = normalizeEventOffering(offering)
  return Object.fromEntries(
    Object.keys(CATALOG)
      .filter((key) => normalized[key].length !== CATALOG[key].length)
      .map((key) => [key, normalized[key]]),
  )
}

/**
 * @returns {{ ok: true } | { ok: false, code: 'OFFERING_CATEGORY_UNAVAILABLE'|'OFFERING_DIVISION_UNAVAILABLE'|'OFFERING_MODALITY_UNAVAILABLE', value: string }}
 */
export function validateSelectionAgainstOffering(selection, offering) {
  const { categories, divisions, modalities } = normalizeEventOffering(offering)
  if (selection.category && !categories.includes(selection.category)) {
    return { ok: false, code: 'OFFERING_CATEGORY_UNAVAILABLE', value: selection.category }
  }
  for (const division of [selection.division, selection.secondaryDivision].filter(Boolean)) {
    if (!divisions.includes(division)) {
      return { ok: false, code: 'OFFERING_DIVISION_UNAVAILABLE', value: division }
    }
  }
  for (const modality of selection.modalities ?? []) {
    if (!modalities.includes(modality)) {
      return { ok: false, code: 'OFFERING_MODALITY_UNAVAILABLE', value: modality }
    }
  }
  return { ok: true }
}
