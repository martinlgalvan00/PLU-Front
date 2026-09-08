const REQUIRED_COMPETITION_PROFILE_FIELDS = [
  'fullName',
  'birthDate',
  'sex',
  'gym',
  'phone',
  'country',
  'province',
  'division',
  'category',
  'estimatedWeight',
]

function isMissingCompetitionField(athlete, field) {
  const value = athlete?.[field]
  if (field === 'estimatedWeight') {
    const weight = Number(String(value ?? '').replace(',', '.').replace(/\s*kg$/i, ''))
    return !Number.isFinite(weight) || weight < 10 || weight > 250
  }
  return !String(value ?? '').trim()
}

export function getMissingCompetitionProfileFields(athlete) {
  if (!athlete) return REQUIRED_COMPETITION_PROFILE_FIELDS
  return REQUIRED_COMPETITION_PROFILE_FIELDS.filter((field) =>
    isMissingCompetitionField(athlete, field),
  )
}

export function hasCompleteCompetitionProfile(athlete) {
  return getMissingCompetitionProfileFields(athlete).length === 0
}
