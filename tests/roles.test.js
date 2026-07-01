import { describe, expect, it } from 'vitest'
import {
  canApproveManualPayments,
  canEditOperationalData,
  canExport,
  canExportPluUsa,
  canManageUsers,
  canViewAdmin,
  getRoleLabel,
  isKnownRole,
} from '../src/lib/roles.js'

describe('roles', () => {
  it('reconoce solo roles canonicos', () => {
    expect(isKnownRole('admin_maximal')).toBe(true)
    expect(isKnownRole('admin_plu_arg')).toBe(true)
    expect(isKnownRole('operador_plu_arg')).toBe(true)
    expect(isKnownRole('viewer_plu_usa')).toBe(true)
    expect(isKnownRole('admin_plu')).toBe(false)
    expect(isKnownRole('athlete_plu')).toBe(false)
  })

  it('permite ver admin a los roles administrativos', () => {
    expect(canViewAdmin('admin_maximal')).toBe(true)
    expect(canViewAdmin('viewer_plu_usa')).toBe(true)
    expect(canViewAdmin(null)).toBe(false)
  })

  it('limita edicion y aprobacion manual a roles operativos', () => {
    expect(canEditOperationalData('admin_maximal')).toBe(true)
    expect(canEditOperationalData('admin_plu_arg')).toBe(true)
    expect(canEditOperationalData('operador_plu_arg')).toBe(true)
    expect(canEditOperationalData('viewer_plu_usa')).toBe(false)
    expect(canApproveManualPayments('operador_plu_arg')).toBe(true)
    expect(canApproveManualPayments('viewer_plu_usa')).toBe(false)
  })

  it('limita gestion de usuarios a admins superiores', () => {
    expect(canManageUsers('admin_maximal')).toBe(true)
    expect(canManageUsers('admin_plu_arg')).toBe(true)
    expect(canManageUsers('operador_plu_arg')).toBe(false)
    expect(canManageUsers('viewer_plu_usa')).toBe(false)
  })

  it('permite export PLU USA tambien al viewer autorizado', () => {
    expect(canExport('viewer_plu_usa')).toBe(true)
    expect(canExportPluUsa('viewer_plu_usa')).toBe(true)
    expect(canExportPluUsa('unknown')).toBe(false)
  })

  it('devuelve etiquetas seguras', () => {
    expect(getRoleLabel('admin_plu_arg')).toBe('Admin PLU ARG')
    expect(getRoleLabel('unknown')).toBe('Sin rol')
  })
})
