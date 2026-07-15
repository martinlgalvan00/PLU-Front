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

export function isPluUsaPartner(role) {
  return permission(role, 'isPluUsaPartner')
}

export function canApproveManualPayments(role) {
  return permission(role, 'canApproveManualPayments')
}

export function canApprovePayments(role) {
  return canApproveManualPayments(role)
}

export function canCheckIn(role) {
  return permission(role, 'canCheckIn')
}

// Rol de solo escaneo (ej. seguridad en la puerta): entra al panel admin
// pero no tiene ninguna otra tarea -- el nav completo (Atletas, Pagos,
// Usuarios...) le queda al pedo y encima expone datos que no necesita ver.
export function isCheckinOnly(role) {
  return permission(role, 'checkinOnly')
}
