import { ROLES } from './constants.js'

function permission(role, key) {
  return ROLES[role]?.[key] ?? false
}

export function isKnownRole(role) {
  return Boolean(ROLES[role])
}

export function getRoleLabel(role) {
  return ROLES[role]?.label ?? 'Sin rol'
}

export function canViewAdmin(role) {
  return permission(role, 'canViewAdmin')
}

export function canEditOperationalData(role) {
  return permission(role, 'canEditOperationalData')
}

export function canEdit(role) {
  return canEditOperationalData(role)
}

export function canManageUsers(role) {
  return permission(role, 'canManageUsers')
}

export function canExport(role) {
  return permission(role, 'canExportAdmin') || permission(role, 'canExportPluUsa')
}

export function canExportPluUsa(role) {
  return permission(role, 'canExportPluUsa')
}

export function canApproveManualPayments(role) {
  return permission(role, 'canApproveManualPayments')
}

export function canApprovePayments(role) {
  return canApproveManualPayments(role)
}
