/**
 * Estado de UI para selects de división por edad (perfil / inscripción).
 * Puro: sin React. El hook en src/hooks solo memoiza esto.
 */

import {
  COMPETITION_DIVISIONS,
  allowedCompetitionDivisions,
  resolveCompetitionDivision,
  resolveRegistrationDivision,
  todayCalendarDate,
} from './ageDivision.js'

/**
 * @param {object} input
 * @param {string|null|undefined} input.birthDate
 * @param {string|null|undefined} [input.eventDate] fecha del evento (inscripción)
 * @param {string[]} [input.allDivisions] lexikon completo del form
 * @param {string} [input.currentDivision] valor actual del form
 */
export function buildAgeDivisionSelectState({
  birthDate = null,
  eventDate = null,
  allDivisions = COMPETITION_DIVISIONS,
  currentDivision = '',
} = {}) {
  const catalog = Array.isArray(allDivisions) && allDivisions.length
    ? allDivisions
    : [...COMPETITION_DIVISIONS]
  const referenceDate = eventDate || todayCalendarDate()
  const hasDob = Boolean(String(birthDate ?? '').trim())
  const suggested = hasDob ? resolveCompetitionDivision(birthDate, referenceDate) : ''
  const allowed = hasDob ? allowedCompetitionDivisions(birthDate, referenceDate) : []
  // Orden: franja natural primero, después Open (como allowedCompetitionDivisions).
  const options = allowed.length
    ? allowed.filter((division) => catalog.includes(division))
    : [...catalog]

  const declared = String(currentDivision ?? '').trim()
  const nextValue = hasDob
    ? resolveRegistrationDivision(birthDate, referenceDate, declared)
    : declared
  // Autocomplete: vacío + sugerencia → franja natural.
  const value = !declared && suggested ? suggested : nextValue

  return {
    options,
    suggested,
    value,
    changed: value !== declared,
    hasAgeRule: hasDob && options.length > 0,
  }
}
