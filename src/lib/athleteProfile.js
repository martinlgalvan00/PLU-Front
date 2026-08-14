/**
 * athleteProfile.js
 *
 * Utilidades de completitud de perfil del atleta.
 * La lógica vive aquí (capa lib/) para ser reutilizada en UI sin duplicar.
 */

/**
 * Campos que el atleta debe completar antes de poder inscribirse a un evento.
 * Estos campos son los requeridos por el schema de inscripción en validation.js
 * (phone, city, province, gym) y son editables por el atleta en PersonalDataSection.
 */
export const REQUIRED_FOR_REGISTRATION = ['phone', 'city', 'province', 'gym']

/**
 * Evalúa qué campos obligatorios de perfil están incompletos.
 *
 * @param {object} athlete - Objeto atleta con sus campos de perfil.
 * @returns {{ complete: boolean, missing: string[], filled: number, total: number }}
 */
export function isProfileComplete(athlete) {
  if (!athlete) return { complete: false, missing: REQUIRED_FOR_REGISTRATION, filled: 0, total: REQUIRED_FOR_REGISTRATION.length }

  const missing = REQUIRED_FOR_REGISTRATION.filter((field) => {
    const value = athlete[field]
    return !value || String(value).trim().length === 0
  })

  return {
    complete: missing.length === 0,
    missing,
    filled: REQUIRED_FOR_REGISTRATION.length - missing.length,
    total: REQUIRED_FOR_REGISTRATION.length,
  }
}
