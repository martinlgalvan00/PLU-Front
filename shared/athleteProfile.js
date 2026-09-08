/**
 * Completitud de perfil del atleta para inscribirse.
 * Vive en shared/ para que UI y API usen la misma regla, sin flag persistido.
 */

export const REQUIRED_FOR_REGISTRATION = [
  'phone',
  'city',
  'province',
  'gym',
  'division',
  'category',
  'estimatedWeight',
]

export const PROFILE_FIELD_GROUPS = {
  phone: 'contact',
  city: 'contact',
  province: 'contact',
  gym: 'sports',
  division: 'competition',
  category: 'competition',
  estimatedWeight: 'competition',
}

export function athleteProfileFromRow(row) {
  if (!row) return null
  return {
    phone: row.phone,
    city: row.city,
    province: row.province,
    gym: row.gym,
    division: row.division,
    category: row.category,
    estimatedWeight: row.estimated_weight ?? row.estimatedWeight,
  }
}

function isMissingRegistrationField(athlete, field) {
  const value = athlete[field]
  if (field === 'estimatedWeight') {
    const weight = Number(String(value ?? '').replace(',', '.').replace(/\s*kg$/i, ''))
    return !Number.isFinite(weight) || weight < 10 || weight > 250
  }
  return !value || String(value).trim().length === 0
}

/**
 * @param {object} athlete
 * @returns {{ complete: boolean, missing: string[], filled: number, total: number }}
 */
export function isProfileComplete(athlete) {
  if (!athlete) {
    return {
      complete: false,
      missing: [...REQUIRED_FOR_REGISTRATION],
      filled: 0,
      total: REQUIRED_FOR_REGISTRATION.length,
    }
  }

  const missing = REQUIRED_FOR_REGISTRATION.filter((field) =>
    isMissingRegistrationField(athlete, field),
  )

  return {
    complete: missing.length === 0,
    missing,
    filled: REQUIRED_FOR_REGISTRATION.length - missing.length,
    total: REQUIRED_FOR_REGISTRATION.length,
  }
}
