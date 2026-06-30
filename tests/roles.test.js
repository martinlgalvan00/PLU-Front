import { describe, expect, it } from 'vitest'
import { canEdit, canManageUsers, canExportPluUsa } from '../src/lib/roles.js'

describe('roles', () => {
  it('admin puede editar', () => {
    expect(canEdit('admin_plu')).toBe(true)
  })

  it('el atleta no puede editar', () => {
    expect(canEdit('athlete_plu')).toBe(false)
  })

  it('el atleta no gestiona usuarios', () => {
    expect(canManageUsers('athlete_plu')).toBe(false)
  })

  it('solo admin exporta PLU USA', () => {
    expect(canExportPluUsa('admin_plu')).toBe(true)
    expect(canExportPluUsa('athlete_plu')).toBe(false)
  })
})
