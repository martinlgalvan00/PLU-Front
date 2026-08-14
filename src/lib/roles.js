import { ROLES } from './constants.js'
import {
  ACCESS_ROLE_TEMPLATES,
  getAllowedAdminSections,
  hasAnyPermission,
  hasPermission,
} from './permissions.js'

const ROLE_LABELS = Object.fromEntries(ACCESS_ROLE_TEMPLATES.map(({ key, name }) => [key, name]))

export function isKnownRole(role) {
  return Boolean(ROLES[role] || ROLE_LABELS[role])
}

export function getRoleLabel(subject) {
  if (subject && typeof subject === 'object') {
    return subject.roleLabel ?? ROLE_LABELS[subject.roleKey] ?? ROLES[subject.role]?.label ?? 'Sin rol'
  }
  return ROLES[subject]?.label ?? ROLE_LABELS[subject] ?? 'Sin rol'
}

export function canViewAdmin(subject) {
  return getAllowedAdminSections(subject).length > 0
}

export function canEditOperationalData(subject) {
  return hasAnyPermission(subject, [
    'admin.athletes.write',
    'admin.memberships.write',
    'admin.events.write',
    'admin.registrations.write',
    'admin.payments.approve',
    'admin.shop.write',
    'admin.results.write',
  ])
}

export function canEdit(subject) {
  return canEditOperationalData(subject)
}

export function canManageUsers(subject) {
  return hasPermission(subject, 'admin.users.write')
}

export function canDeleteUsers(subject) {
  return hasPermission(subject, 'admin.users.delete')
}

// Mismo criterio que canDeleteUsers: borrar un atleta con toda su historia
// (pagos, inscripciones, credenciales) es la accion mas destructiva del panel.
export function canDeleteAthletes(subject) {
  return hasPermission(subject, 'admin.athletes.delete')
}

export function canDeleteMemberships(subject) {
  return hasPermission(subject, 'admin.memberships.delete')
}

export function canDeleteRegistrations(subject) {
  return hasPermission(subject, 'admin.registrations.delete')
}

// Mismo criterio que canDeleteAthletes: borrar un evento se lleva puestas sus
// inscripciones, entradas y acreditaciones. `admin.events.write` alcanza para
// editarlo y cerrarlo, no para hacerlo desaparecer.
export function canDeleteEvents(subject) {
  return hasPermission(subject, 'admin.events.delete')
}

export function canManageRoles(subject) {
  return hasPermission(subject, 'admin.roles.write')
}

export function canExport(subject) {
  return hasAnyPermission(subject, ['admin.exports.admin', 'admin.exports.plu_usa'])
}

export function canExportPluUsa(subject) {
  return hasPermission(subject, 'admin.exports.plu_usa')
}

export function isPluUsaPartner(subject) {
  const roleKey =
    typeof subject === 'string'
      ? subject
      : subject?.roleKey ?? subject?.role
  return roleKey === 'viewer_plu_usa'
}

export function canApproveManualPayments(subject) {
  return hasPermission(subject, 'admin.payments.approve')
}

export function canApprovePayments(subject) {
  return canApproveManualPayments(subject)
}

export function canCheckIn(subject) {
  return hasPermission(subject, 'admin.checkin.execute')
}

// Rol de solo escaneo (ej. seguridad en la puerta): entra al panel admin
// pero no tiene ninguna otra tarea -- el nav completo (Atletas, Pagos,
// Usuarios...) le queda al pedo y encima expone datos que no necesita ver.
export function isCheckinOnly(subject) {
  const allowedSections = getAllowedAdminSections(subject)
  return allowedSections.length > 0 && allowedSections.every((section) => ['events', 'checkin'].includes(section))
}
