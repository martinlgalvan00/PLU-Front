const REQUIRED_COMPETITION_PROFILE_FIELDS = [
  'fullName',
  'birthDate',
  'sex',
  'gym',
  'phone',
  'country',
  'province',
]

export function getMissingCompetitionProfileFields(athlete) {
  if (!athlete) return REQUIRED_COMPETITION_PROFILE_FIELDS
  return REQUIRED_COMPETITION_PROFILE_FIELDS.filter((field) => !String(athlete[field] ?? '').trim())
}

export function hasCompleteCompetitionProfile(athlete) {
  return getMissingCompetitionProfileFields(athlete).length === 0
}
