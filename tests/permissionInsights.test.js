import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  RESERVED_PERMISSION_KEYS,
} from '../src/lib/permissions.js'
import {
  SENSITIVE_CAPABILITIES,
  applyPermissionToggle,
  diffPermissions,
  getModuleAccess,
  getSensitiveStatus,
  groupCatalogByModule,
  groupModulesByArea,
  getSensitiveCapability,
  groupRolesByTier,
  permissionColumn,
  presetPermissionKeys,
  summarizeRoleAccess,
} from '../src/lib/permissionInsights.js'
import { assertMutablePermissionSet } from '../server/services/accessControlService.js'

const byKey = (key) => PERMISSION_CATALOG.find((permission) => permission.key === key)
const entryFor = (moduleKey) =>
  groupCatalogByModule(PERMISSION_CATALOG).find((entry) => entry.module === moduleKey)

describe('catálogo agrupado por área', () => {
  it('ubica cada módulo del catálogo en exactamente un área', () => {
    const areas = groupModulesByArea(PERMISSION_CATALOG)
    const placed = areas.flatMap((area) => area.modules.map((entry) => entry.module))
    const expected = [...new Set(PERMISSION_CATALOG.map((permission) => permission.module))]

    expect([...placed].sort()).toEqual([...expected].sort())
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('un módulo nuevo sin área asignada aparece en "other" en vez de desaparecer', () => {
    const catalog = [
      ...PERMISSION_CATALOG,
      {
        key: 'admin.sponsors.read',
        module: 'sponsors',
        moduleLabel: 'Sponsors',
        action: 'read',
        sortOrder: 500,
      },
    ]
    const areas = groupModulesByArea(catalog)
    const other = areas.find((area) => area.id === 'other')

    expect(other.modules.map((entry) => entry.module)).toEqual(['sponsors'])
  })
})

describe('nivel de acceso por módulo', () => {
  it('sin permisos del módulo es none', () => {
    expect(getModuleAccess(entryFor('athletes'), []).level).toBe('none')
  })

  it('solo lectura es view', () => {
    expect(getModuleAccess(entryFor('athletes'), ['admin.athletes.read']).level).toBe('view')
  })

  it('leer y escribir completa un módulo que no ofrece nada más (salvo borrar)', () => {
    const access = getModuleAccess(entryFor('events'), ['admin.events.read', 'admin.events.write'])
    expect(access.level).toBe('full')
    expect(access.hasDestructive).toBe(false)
  })

  it('borrar no cuenta para el nivel, pero se señala aparte', () => {
    const access = getModuleAccess(entryFor('athletes'), [
      'admin.athletes.read',
      'admin.athletes.delete',
    ])
    expect(access.level).toBe('view')
    expect(access.hasDestructive).toBe(true)
  })

  it('un módulo solo de consulta no llega a full aunque tenga todo', () => {
    expect(getModuleAccess(entryFor('audit'), ['admin.audit.read']).level).toBe('view')
  })

  it('aprobar pagos sobre la lectura completa el módulo', () => {
    expect(
      getModuleAccess(entryFor('payments'), ['admin.payments.read', 'admin.payments.approve'])
        .level,
    ).toBe('full')
  })

  it('exportaciones no sigue la semántica ver/editar: alguna es partial, todas es full', () => {
    expect(getModuleAccess(entryFor('exports'), ['admin.exports.admin']).level).toBe('partial')
    expect(
      getModuleAccess(entryFor('exports'), ['admin.exports.admin', 'admin.exports.plu_usa']).level,
    ).toBe('full')
  })

  it('un rol con permisos de borrado sin lectura (matriz inválida) no queda invisible', () => {
    expect(getModuleAccess(entryFor('events'), ['admin.events.delete']).level).toBe('partial')
  })
})

describe('capacidades sensibles', () => {
  it('cubre todos los permisos de borrado del catálogo', () => {
    const deletes = PERMISSION_CATALOG.filter((permission) => permission.action === 'delete')
    const covered = SENSITIVE_CAPABILITIES.map((capability) => capability.key)

    for (const permission of deletes) {
      expect(covered).toContain(permission.key)
    }
  })

  it('cada capacidad apunta a un permiso real del catálogo', () => {
    for (const capability of SENSITIVE_CAPABILITIES) {
      expect(byKey(capability.key), capability.key).toBeTruthy()
    }
  })

  it('el Administrador por defecto no puede borrar; el Super Admin sí', () => {
    const admin = getSensitiveStatus(PERMISSION_CATALOG, DEFAULT_ROLE_PERMISSIONS.admin_plu_arg)
    const superAdmin = getSensitiveStatus(
      PERMISSION_CATALOG,
      DEFAULT_ROLE_PERMISSIONS.admin_maximal,
    )

    const destructive = (rows) => rows.filter((row) => row.destructive)
    expect(destructive(admin).every((row) => !row.granted)).toBe(true)
    expect(destructive(superAdmin).every((row) => row.granted)).toBe(true)
  })

  it('el resumen cuenta capacidades y borrados concedidos', () => {
    const summary = summarizeRoleAccess(PERMISSION_CATALOG, [
      'admin.athletes.read',
      'admin.athletes.delete',
      'admin.payments.read',
      'admin.payments.approve',
    ])

    expect(summary.sensitive).toBe(2)
    expect(summary.destructive).toBe(1)
    expect(summary.modules).toBe(2)
    expect(summary.permissions).toBe(4)
  })
})

describe('columnas del editor', () => {
  it('toda capacidad sensible vive en la columna de acciones sensibles', () => {
    for (const capability of SENSITIVE_CAPABILITIES) {
      expect(permissionColumn(byKey(capability.key)), capability.key).toBe('sensitive')
      expect(getSensitiveCapability(capability.key)).toBe(capability)
    }
  })

  it('leer va en Ver y escribir u operar en Modificar', () => {
    expect(permissionColumn(byKey('admin.athletes.read'))).toBe('view')
    expect(permissionColumn(byKey('admin.athletes.write'))).toBe('modify')
    expect(permissionColumn(byKey('admin.checkin.execute'))).toBe('modify')
  })

  it('ningún permiso queda sin columna ni repetido', () => {
    const seen = new Set()
    for (const permission of PERMISSION_CATALOG) {
      expect(['view', 'modify', 'sensitive']).toContain(permissionColumn(permission))
      expect(seen.has(permission.key)).toBe(false)
      seen.add(permission.key)
    }
  })

  it('un permiso común no figura como capacidad sensible', () => {
    expect(getSensitiveCapability('admin.athletes.read')).toBeNull()
  })
})

describe('edición con dependencias', () => {
  it('operar un módulo habilita su lectura', () => {
    const next = applyPermissionToggle(PERMISSION_CATALOG, [], byKey('admin.athletes.write'), true)
    expect(next).toEqual(['admin.athletes.read', 'admin.athletes.write'])
  })

  it('un permiso de borrado también arrastra la lectura', () => {
    const next = applyPermissionToggle(PERMISSION_CATALOG, [], byKey('admin.events.delete'), true)
    expect(next).toContain('admin.events.read')
  })

  it('quitar la lectura quita todo el módulo, incluido borrar', () => {
    const current = ['admin.athletes.read', 'admin.athletes.write', 'admin.athletes.delete']
    const next = applyPermissionToggle(
      PERMISSION_CATALOG,
      current,
      byKey('admin.athletes.read'),
      false,
    )
    expect(next).toEqual([])
  })

  it('exportaciones no exige lectura de nada', () => {
    const next = applyPermissionToggle(PERMISSION_CATALOG, [], byKey('admin.exports.admin'), true)
    expect(next).toEqual(['admin.exports.admin'])
  })

  it('devuelve las claves en el orden del catálogo', () => {
    const next = applyPermissionToggle(
      PERMISSION_CATALOG,
      ['admin.payments.read'],
      byKey('admin.athletes.read'),
      true,
    )
    expect(next).toEqual(['admin.athletes.read', 'admin.payments.read'])
  })
})

describe('atajos', () => {
  it('solo lectura no incluye exportaciones ni permisos reservados', () => {
    const keys = presetPermissionKeys('read-only', PERMISSION_CATALOG)

    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((key) => byKey(key).action === 'read')).toBe(true)
    expect(keys).not.toContain('admin.exports.plu_usa')
  })

  it('lectura y edición no aprueba, no elimina, no exporta y no toca lo reservado', () => {
    const keys = presetPermissionKeys('edit', PERMISSION_CATALOG)

    expect(keys).toContain('admin.athletes.write')
    expect(keys).toContain('admin.checkin.execute')
    expect(keys).not.toContain('admin.payments.approve')
    expect(keys).not.toContain('admin.athletes.delete')
    expect(keys).not.toContain('admin.analytics.identity')
    expect(keys).not.toContain('admin.exports.admin')
    for (const reserved of RESERVED_PERMISSION_KEYS) {
      expect(keys).not.toContain(reserved)
    }
  })

  it('limpiar conserva los reservados que el rol ya traía', () => {
    const keys = presetPermissionKeys('clear', PERMISSION_CATALOG, [
      'admin.athletes.read',
      'admin.users.write',
    ])
    expect(keys).toEqual(['admin.users.write'])
  })

  it('cualquier atajo produce una matriz que el servidor acepta', () => {
    const actor = { roleKey: 'admin_maximal' }
    const role = { key: 'tesoreria', isProtected: false, active: true }

    for (const preset of ['read-only', 'edit', 'clear']) {
      const keys = presetPermissionKeys(preset, PERMISSION_CATALOG)
      expect(() => assertMutablePermissionSet(actor, role, keys), preset).not.toThrow()
    }
  })
})

describe('diferencias entre guardado y borrador', () => {
  it('separa lo otorgado de lo retirado', () => {
    expect(diffPermissions(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] })
  })
})

describe('jerarquía de roles', () => {
  it('agrupa protegidos, de sistema y personalizados, en ese orden', () => {
    const groups = groupRolesByTier([
      { id: 'c', name: 'Tesorería', isSystem: false, isProtected: false, hierarchyLevel: 3 },
      { id: 'b', name: 'PLU', isSystem: true, isProtected: false, hierarchyLevel: 3 },
      { id: 'a', name: 'Super Admin', isSystem: true, isProtected: true, hierarchyLevel: 1 },
    ])

    expect(groups.map((group) => group.id)).toEqual(['protected', 'system', 'custom'])
    expect(groups[0].roles[0].name).toBe('Super Admin')
  })

  it('omite los grupos vacíos', () => {
    const groups = groupRolesByTier([{ id: 'a', name: 'PLU', isSystem: true, hierarchyLevel: 3 }])
    expect(groups.map((group) => group.id)).toEqual(['system'])
  })
})
