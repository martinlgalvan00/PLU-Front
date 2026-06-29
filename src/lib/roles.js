import { ROLES } from './constants.js'

export function canEdit(role) {
  return ROLES[role]?.canEdit ?? false
}

export function canManageUsers(role) {
  return ROLES[role]?.canManageUsers ?? false
}

export function canExport(role) {
  return Boolean(ROLES[role])
}

export function canExportPluUsa(role) {
  return role === 'viewer_plu_usa' || canEdit(role)
}

export function canApprovePayments(role) {
  return canEdit(role)
}
