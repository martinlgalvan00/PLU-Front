import { describe, expect, it } from 'vitest'
import { canEdit, canManageUsers, canExportPluUsa } from '../src/lib/roles.js'

describe('roles', () => {
  it('admin puede editar', () => {
    expect(canEdit('admin_plu_arg')).toBe(true)
  })

  it('PLU USA no puede editar', () => {
    expect(canEdit('viewer_plu_usa')).toBe(false)
  })

  it('operador no gestiona usuarios', () => {
    expect(canManageUsers('operador_plu_arg')).toBe(false)
  })

  it('PLU USA puede exportar', () => {
    expect(canExportPluUsa('viewer_plu_usa')).toBe(true)
  })
})
