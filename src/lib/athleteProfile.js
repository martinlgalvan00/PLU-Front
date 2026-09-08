/**
 * Reexporta la regla de completitud desde shared/ para no romper imports de UI.
 */
export {
  REQUIRED_FOR_REGISTRATION,
  PROFILE_FIELD_GROUPS,
  athleteProfileFromRow,
  isProfileComplete,
} from '../../shared/athleteProfile.js'

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
