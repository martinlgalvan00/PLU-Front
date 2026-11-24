import { describe, expect, it } from 'vitest'
import { PERMISSION_CATALOG } from '../src/lib/permissions.js'
import {
  applyPackageToggle,
  getPackageState,
  listPackageStates,
  packagePermissionKeys,
} from '../src/lib/permissionInsights.js'

describe('paquetes de permisos', () => {
  it('expande claves existentes y omite reservadas', () => {
    const keys = packagePermissionKeys('event_control', PERMISSION_CATALOG)
    expect(keys).toContain('admin.events.read')
    expect(keys).toContain('admin.events.write')
    expect(keys).toContain('admin.registrations.read')
    expect(keys).not.toContain('admin.users.write')
  })

  it('reporta all / partial / none según el borrador', () => {
    expect(getPackageState('checkin_ops', PERMISSION_CATALOG, [])).toBe('none')
    expect(
      getPackageState('checkin_ops', PERMISSION_CATALOG, ['admin.events.read']),
    ).toBe('partial')
    expect(
      getPackageState('checkin_ops', PERMISSION_CATALOG, [
        'admin.events.read',
        'admin.checkin.execute',
      ]),
    ).toBe('all')
  })

  it('al activar un paquete agrega dependencias de lectura', () => {
    const next = applyPackageToggle(PERMISSION_CATALOG, [], 'event_payments', true)
    expect(next).toContain('admin.payments.read')
    expect(next).toContain('admin.payments.approve')
  })

  it('al desactivar un paquete quita solo sus claves', () => {
    const start = applyPackageToggle(PERMISSION_CATALOG, [], 'event_control', true)
    const withExtra = applyPackageToggle(PERMISSION_CATALOG, start, 'exports_ops', true)
    const next = applyPackageToggle(PERMISSION_CATALOG, withExtra, 'event_control', false)
    expect(next).not.toContain('admin.events.write')
    expect(next).toContain('admin.exports.admin')
  })

  it('lista solo paquetes aplicables al catálogo', () => {
    const states = listPackageStates(PERMISSION_CATALOG, [])
    expect(states.some((pack) => pack.id === 'event_control')).toBe(true)
    expect(states.every((pack) => pack.keys.length > 0)).toBe(true)
  })
})
