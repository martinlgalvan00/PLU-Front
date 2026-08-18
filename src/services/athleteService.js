import { PRICING, PROCEDURE_TYPES } from '../lib/constants.js'

/**
 * athleteService.js — PLU ARG
 *
 * La creación/mutación de atletas, membresías, inscripciones y pagos ahora
 * vive en el backend real (ver src/services/athleteApi.js y
 * supabase/migrations/20260715*_phase2_*.sql) — antes de esta migración
 * este archivo mutaba arrays en localStorage. Lo que queda acá son
 * utilidades puras, sin estado, que siguen usando otras partes del
 * frontend (formularios, resúmenes de precio).
 */

export function calculateAmount(procedureType) {
  return PROCEDURE_TYPES[procedureType]?.amount ?? 0
}

export function findDuplicateAthlete(athletes, { email, documentId }) {
  return athletes.find(
    (a) => a.email.toLowerCase() === email.toLowerCase() || a.documentId === documentId,
  )
}

export const MEMBERSHIP_PRICE = PRICING.membership
export const REGISTRATION_PRICE = PRICING.event
