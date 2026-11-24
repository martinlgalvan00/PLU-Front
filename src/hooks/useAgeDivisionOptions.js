import { useMemo } from 'react'
import { buildAgeDivisionSelectState } from '../../shared/ageDivisionUi.js'

/**
 * Opciones y valor sugerido/clampeado de división según DOB (+ fecha evento).
 */
export function useAgeDivisionOptions({
  birthDate = null,
  eventDate = null,
  allDivisions = [],
  currentDivision = '',
} = {}) {
  return useMemo(
    () =>
      buildAgeDivisionSelectState({
        birthDate,
        eventDate,
        allDivisions,
        currentDivision,
      }),
    [allDivisions, birthDate, currentDivision, eventDate],
  )
}
