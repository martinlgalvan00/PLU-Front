/**
 * Reexporta la regla de completitud desde shared/ para no romper imports de UI.
 */
export {
  REQUIRED_FOR_REGISTRATION,
  REQUIRED_FOR_PROFILE_NOTICE,
  PROFILE_FIELD_GROUPS,
  athleteProfileFromRow,
  isProfileComplete,
  getMissingProfileNoticeFields,
  isProfileNoticeComplete,
} from '../../shared/athleteProfile.js'

const PROFILE_FIELD_LABEL_KEYS = {
  phone: 'admin.athleteDetail.fields.phone',
  city: 'admin.athleteDetail.fields.city',
  province: 'admin.athleteDetail.fields.province',
  streetAddress: 'admin.athleteDetail.fields.streetAddress',
  postalCode: 'admin.athleteDetail.fields.postalCode',
  email: 'admin.athleteDetail.fields.email',
  gym: 'admin.athleteDetail.fields.gym',
  sex: 'admin.athleteDetail.fields.sex',
  division: 'admin.athleteDetail.fields.division',
  category: 'admin.athleteDetail.fields.category',
  estimatedWeight: 'admin.athleteDetail.fields.estimatedWeight',
  fullName: 'admin.athleteDetail.fields.fullName',
  birthDate: 'admin.athleteDetail.fields.birthDate',
  country: 'admin.athleteDetail.fields.country',
  emergencyContactName: 'admin.athleteDetail.fields.emergencyContactName',
  emergencyContactPhone: 'admin.athleteDetail.fields.emergencyContactPhone',
  document: 'admin.athleteDetail.fields.document',
}

/** Etiqueta de un campo de ficha. Si no hay traducción, no muestra la clave interna. */
export function profileFieldLabel(field, t) {
  const key = PROFILE_FIELD_LABEL_KEYS[field]
  return key ? t(key) : String(field ?? '')
}

export function isUnreadProfileNotice(notice) {
  return Boolean(notice && !notice.readAt && !notice.dismissedAt && !notice.resolvedAt)
}

export function isVisibleProfileNotice(notice) {
  return Boolean(notice && !notice.dismissedAt && !notice.resolvedAt)
}

export function hasUnreadProfileNotice(notices = []) {
  return notices.some(isUnreadProfileNotice)
}

export function visibleProfileNotice(notices = []) {
  return notices.find(isVisibleProfileNotice) ?? null
}
