import { describe, expect, it } from 'vitest'
import {
  canApproveManualPayments,
  canEditOperationalData,
  canExport,
  canExportPluUsa,
  canManageRoles,
  canManageUsers,
  canViewAdmin,
  getRoleLabel,
  isKnownRole,
} from '../src/lib/roles.js'
import {
  canAccessSecurityEvent,
  canManageRolePermissions,
  getAllowedAdminSections,
  getRoleHierarchyLevel,
  hasEventScopeAccess,
  hasPermission,
  ROLE_HIERARCHY,
} from '../src/lib/permissions.js'

describe('roles', () => {
  it('mantiene los cuatro roles base de la jerarquía', () => {
    expect(ROLE_HIERARCHY).toEqual([
      'admin_maximal',
      'admin_plu_arg',
      'plu_arg',
      'seguridad_plu_arg',
    ])
    expect(ROLE_HIERARCHY.every((role) => isKnownRole(role))).toBe(true)
    expect(isKnownRole('operador_plu_arg')).toBe(false)
    expect(isKnownRole('viewer_plu_usa')).toBe(false)
  })

  it('ordena la jerarquía desde Super Admin hasta Seguridad', () => {
    expect(getRoleHierarchyLevel('admin_maximal')).toBe(1)
    expect(getRoleHierarchyLevel('admin_plu_arg')).toBe(2)
    expect(getRoleHierarchyLevel('plu_arg')).toBe(3)
    expect(getRoleHierarchyLevel('seguridad_plu_arg')).toBe(4)
    expect(getRoleHierarchyLevel('custom_prensa')).toBe(3)
  })

  it('permite ver el panel a los cuatro roles según su matriz', () => {
    expect(canViewAdmin('admin_maximal')).toBe(true)
    expect(canViewAdmin('admin_plu_arg')).toBe(true)
    expect(canViewAdmin('plu_arg')).toBe(true)
    expect(canViewAdmin('seguridad_plu_arg')).toBe(true)
  })

  it('protege operación y usuarios en los niveles superiores por defecto', () => {
    expect(canEditOperationalData('admin_maximal')).toBe(true)
    expect(canEditOperationalData('admin_plu_arg')).toBe(true)
    expect(canEditOperationalData('plu_arg')).toBe(false)
    expect(canApproveManualPayments('plu_arg')).toBe(false)
    expect(canManageUsers('admin_maximal')).toBe(true)
    expect(canManageUsers('admin_plu_arg')).toBe(true)
    expect(canManageUsers('plu_arg')).toBe(false)
    expect(canManageRoles('admin_plu_arg')).toBe(true)
  })

  it('permite administrar permisos de roles operativos base y personalizados', () => {
    expect(canManageRolePermissions('admin_maximal', 'plu_arg')).toBe(true)
    expect(canManageRolePermissions('admin_maximal', 'seguridad_plu_arg')).toBe(true)
    expect(canManageRolePermissions('admin_plu_arg', 'plu_arg')).toBe(true)
    expect(canManageRolePermissions('admin_plu_arg', 'seguridad_plu_arg')).toBe(true)
    expect(
      canManageRolePermissions('admin_plu_arg', {
        key: 'custom_prensa',
        isProtected: false,
        active: true,
      }),
    ).toBe(true)
    expect(canManageRolePermissions('admin_plu_arg', 'admin_maximal')).toBe(false)
    expect(canManageRolePermissions('plu_arg', 'seguridad_plu_arg')).toBe(false)
  })

  it('autoriza el portal de seguridad por permiso y alcance de evento', () => {
    const globalAdmin = {
      roleKey: 'admin_maximal',
      permissions: ['admin.checkin.execute'],
      eventId: null,
      eventSlug: null,
    }
    const scopedOperator = {
      roleKey: 'custom_acceso',
      permissions: ['admin.checkin.execute'],
      eventId: 'evt-spring',
      eventSlug: 'spring-classic-2025',
    }

    expect(canAccessSecurityEvent(globalAdmin, 'cualquier-evento')).toBe(true)
    expect(canAccessSecurityEvent(scopedOperator, 'spring-classic-2025')).toBe(true)
    expect(canAccessSecurityEvent(scopedOperator, 'otro-evento')).toBe(false)
    expect(hasEventScopeAccess(scopedOperator, { eventId: 'evt-spring' })).toBe(true)
    expect(hasEventScopeAccess(scopedOperator, { eventId: 'evt-otro' })).toBe(false)
    expect(
      canAccessSecurityEvent(
        { ...scopedOperator, permissions: ['admin.events.read'] },
        'spring-classic-2025',
      ),
    ).toBe(false)
  })

  it('mantiene exportación institucional para PLU', () => {
    expect(canExport('plu_arg')).toBe(true)
    expect(canExportPluUsa('plu_arg')).toBe(false)
    expect(canExportPluUsa('admin_maximal')).toBe(true)
  })

  it('devuelve etiquetas seguras y consistentes', () => {
    expect(getRoleLabel('admin_maximal')).toBe('Super Admin')
    expect(getRoleLabel('admin_plu_arg')).toBe('Administrador')
    expect(getRoleLabel('plu_arg')).toBe('PLU')
    expect(getRoleLabel('unknown')).toBe('Sin rol')
  })

  it('usa la matriz de sesión por encima del rol base', () => {
    const plu = {
      role: 'operador_plu_arg',
      roleKey: 'plu_arg',
      permissions: ['admin.events.read', 'admin.results.read'],
    }

    expect(hasPermission(plu, 'admin.events.read')).toBe(true)
    expect(hasPermission(plu, 'admin.events.write')).toBe(false)
    expect(canEditOperationalData(plu)).toBe(false)
    expect(getAllowedAdminSections(plu)).toEqual(['events', 'results'])
  })
})
