/**
 * Léxico competitivo compartido. Las clases de peso viven en pluWeightClasses.js.
 * La división etaria y sus alias viven en ageDivision.js.
 */

import {
  COMPETITION_DIVISIONS,
  normalizeCompetitionDivision,
} from './ageDivision.js'
import { canonicalDeclaredWeightClass } from './pluWeightClasses.js'

export const EQUIPMENT_TYPES = Object.freeze([
  'Raw',
  'Raw With Wraps',
  'Single-Ply',
  'Multi-Ply',
  'Unlimited',
])

export const AGE_DIVISIONS = COMPETITION_DIVISIONS

export function normalizeGender(value) {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === 'masculino' || key === 'male' || key === 'm' || key === 'hombre') return 'Male'
  if (key === 'femenino' || key === 'female' || key === 'f' || key === 'mujer') return 'Female'
  return ''
}

export function normalizeEquipment(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  return EQUIPMENT_TYPES.find((item) => item.toLowerCase() === raw) ?? ''
}

export function normalizeDivision(value) {
  return normalizeCompetitionDivision(value)
}

export function normalizeWeightClass(value) {
  return canonicalDeclaredWeightClass(value)
}

function profileKg(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).trim().replace(/\s*kg$/i, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** True si cambió división, equipamiento o peso estimado. El resto del perfil no cuenta. */
export function competitionProfileFieldsChanged(current, next) {
  return (
    normalizeDivision(current?.division) !== normalizeDivision(next?.division) ||
    normalizeEquipment(current?.category) !== normalizeEquipment(next?.category) ||
    profileKg(current?.estimatedWeight ?? current?.estimated_weight) !==
      profileKg(next?.estimatedWeight ?? next?.estimated_weight)
  )
}
