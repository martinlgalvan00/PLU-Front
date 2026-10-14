import { RESERVED_PERMISSION_KEYS } from './permissions.js'

/**
 * permissionInsights.js — PLU ARG
 *
 * Lectura de la matriz de permisos pensada para quien supervisa: qué nivel de
 * acceso tiene cada rol en cada módulo y cuáles son las acciones que merecen
 * una mirada aparte. No decide quién puede qué —eso vive en `permissions.js` y
 * en el servidor—: sólo traduce el catálogo atómico a algo que se pueda leer de
 * un vistazo y edita borradores sin romper las dependencias entre permisos.
 */

/**
 * Agrupación de módulos para leer la matriz por tema y no como una lista de 17
 * filas. Un módulo que el catálogo agregue y no figure acá cae en "other": no
 * desaparece de la pantalla mientras alguien le asigna un área.
 */
export const PERMISSION_AREAS = Object.freeze([
  {
    id: 'people',
    modules: ['athletes', 'memberships', 'registrations', 'staff_applications'],
  },
  {
    id: 'competition',
    modules: ['events', 'event_team', 'results', 'checkin', 'registration_access'],
  },
  {
    id: 'money',
    modules: ['payments', 'pricing', 'shop', 'exports'],
  },
  {
    id: 'system',
    modules: ['dashboard', 'analytics', 'audit', 'users', 'roles'],
  },
])

export const ACCESS_LEVELS = Object.freeze(['none', 'view', 'partial', 'full'])

/**
 * Acciones que cambian dinero, borran datos, sacan información del sistema o
 * administran quién entra. Van en una fila propia de la matriz porque son lo
 * primero que alguien que supervisa quiere saber de un rol. El orden es el de
 * gravedad: gobierno de accesos, borrados, dinero, datos.
 */
export const SENSITIVE_CAPABILITIES = Object.freeze([
  { id: 'manage_roles', key: 'admin.roles.write' },
  { id: 'manage_users', key: 'admin.users.write' },
  { id: 'delete_users', key: 'admin.users.delete', destructive: true },
  { id: 'delete_athletes', key: 'admin.athletes.delete', destructive: true },
  { id: 'delete_memberships', key: 'admin.memberships.delete', destructive: true },
  { id: 'delete_registrations', key: 'admin.registrations.delete', destructive: true },
  { id: 'delete_events', key: 'admin.events.delete', destructive: true },
  { id: 'approve_payments', key: 'admin.payments.approve' },
  { id: 'publish_pricing', key: 'admin.pricing.write' },
  { id: 'open_gates', key: 'admin.registration_access.write' },
  { id: 'export_internal', key: 'admin.exports.admin' },
  { id: 'export_plu_usa', key: 'admin.exports.plu_usa' },
  { id: 'athlete_journey', key: 'admin.analytics.identity' },
  { id: 'approve_staff', key: 'admin.staff_applications.approve' },
])

/** Acciones con las que se arma un borrador de un toque. */
const PRESET_ACTIONS = {
  'read-only': ['read'],
  // Ver y modificar. Aprobar, eliminar, exportar y ver personas identificadas
  // son decisiones que se toman a propósito, una por una.
  edit: ['read', 'write', 'execute'],
}

export function isReservedPermission(permissionKey) {
  return RESERVED_PERMISSION_KEYS.includes(permissionKey)
}

/**
 * `read` → ver; `delete` → destructivo; exportaciones → salen datos del
 * sistema; el resto (editar, aprobar, operar, ver recorrido) → actúa.
 * Exportaciones tienen su propia etiqueta en el catálogo y no siguen la
 * semántica leer/escribir (`exports.plu_usa` figura como `read`).
 */
export function permissionTier(permission) {
  if (permission.module === 'exports') return 'export'
  if (permission.action === 'read') return 'view'
  if (permission.action === 'delete') return 'danger'
  return 'act'
}

const SENSITIVE_BY_KEY = new Map(
  SENSITIVE_CAPABILITIES.map((capability) => [capability.key, capability]),
)

/** La capacidad sensible que concede un permiso, o `null` si es de uso común. */
export function getSensitiveCapability(permissionKey) {
  return SENSITIVE_BY_KEY.get(permissionKey) ?? null
}

/**
 * Columna del editor donde vive cada permiso: ver, modificar o acción
 * sensible. Es la misma frontera que usa la fila "Acciones sensibles" de la
 * comparación, así que lo que se marca en rojo ahí se edita en esa columna.
 */
export function permissionColumn(permission) {
  if (SENSITIVE_BY_KEY.has(permission.key)) return 'sensitive'
  return permission.action === 'read' ? 'view' : 'modify'
}

function sortKeysByCatalog(catalog, keys) {
  return catalog.filter((candidate) => keys.has(candidate.key)).map((candidate) => candidate.key)
}

/** Módulos del catálogo con sus permisos, en el orden del catálogo. */
export function groupCatalogByModule(catalog = []) {
  const byModule = new Map()
  for (const permission of catalog) {
    const entry = byModule.get(permission.module) ?? {
      module: permission.module,
      label: permission.moduleLabel ?? permission.module,
      sortOrder: permission.sortOrder ?? 0,
      permissions: [],
    }
    entry.permissions.push(permission)
    entry.sortOrder = Math.min(entry.sortOrder, permission.sortOrder ?? 0)
    byModule.set(permission.module, entry)
  }
  return [...byModule.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Módulos agrupados por área, con el orden fijo de `PERMISSION_AREAS`. */
export function groupModulesByArea(catalog = []) {
  const modules = groupCatalogByModule(catalog)
  const byKey = new Map(modules.map((entry) => [entry.module, entry]))
  const placed = new Set()

  const areas = PERMISSION_AREAS.map((area) => {
    const entries = area.modules.map((moduleKey) => byKey.get(moduleKey)).filter(Boolean)
    entries.forEach((entry) => placed.add(entry.module))
    return { id: area.id, modules: entries }
  })

  const rest = modules.filter((entry) => !placed.has(entry.module))
  if (rest.length > 0) areas.push({ id: 'other', modules: rest })

  return areas.filter((area) => area.modules.length > 0)
}

/**
 * Nivel de acceso de un conjunto de permisos sobre un módulo.
 *
 * - `none`: sin ningún permiso.
 * - `view`: sólo consulta.
 * - `partial`: actúa sobre el módulo, pero no tiene todo lo que éste ofrece.
 * - `full`: todo lo del módulo, salvo borrar (que se señala aparte).
 *
 * Un módulo que sólo se consulta (Auditoría) no puede estar "completo" en
 * sentido de operar: con todo concedido sigue siendo `view`.
 */
export function getModuleAccess(entry, grantedKeys) {
  const granted = grantedKeys instanceof Set ? grantedKeys : new Set(grantedKeys ?? [])
  const permissions = entry.permissions
  const main = permissions.filter((permission) => permissionTier(permission) !== 'danger')
  const hasDestructive = permissions.some(
    (permission) => permission.action === 'delete' && granted.has(permission.key),
  )
  const grantedMain = main.filter((permission) => granted.has(permission.key))
  const grantedCount = permissions.filter((permission) => granted.has(permission.key)).length

  let level = 'none'
  if (grantedMain.length > 0) {
    const flat = main.every((permission) => permissionTier(permission) === 'export')
    const hasAct = main.some((permission) => permissionTier(permission) === 'act')
    const allMain = grantedMain.length === main.length

    if (flat) {
      level = allMain ? 'full' : 'partial'
    } else if (allMain) {
      level = hasAct ? 'full' : 'view'
    } else {
      const acts = grantedMain.some((permission) => permissionTier(permission) === 'act')
      level = acts ? 'partial' : 'view'
    }
  } else if (hasDestructive) {
    // Borrar sin siquiera ver es una matriz inválida (el servidor la rechaza),
    // pero si llega así se muestra en vez de esconderla.
    level = 'partial'
  }

  return {
    level,
    granted: grantedCount,
    total: permissions.length,
    hasDestructive,
  }
}

/** Qué capacidades sensibles tiene concedidas un conjunto de permisos. */
export function getSensitiveStatus(catalog, grantedKeys) {
  const granted = grantedKeys instanceof Set ? grantedKeys : new Set(grantedKeys ?? [])
  const present = new Set(catalog.map((permission) => permission.key))
  return SENSITIVE_CAPABILITIES.filter((capability) => present.has(capability.key)).map(
    (capability) => ({ ...capability, granted: granted.has(capability.key) }),
  )
}

/** Resumen de una fila de rol para encabezados y fichas. */
export function summarizeRoleAccess(catalog, grantedKeys) {
  const granted = grantedKeys instanceof Set ? grantedKeys : new Set(grantedKeys ?? [])
  const modules = groupCatalogByModule(catalog)
  const sensitive = getSensitiveStatus(catalog, granted)

  return {
    permissions: catalog.filter((permission) => granted.has(permission.key)).length,
    totalPermissions: catalog.length,
    modules: modules.filter((entry) => getModuleAccess(entry, granted).level !== 'none').length,
    totalModules: modules.length,
    sensitive: sensitive.filter((capability) => capability.granted).length,
    totalSensitive: sensitive.length,
    destructive: sensitive.filter((capability) => capability.granted && capability.destructive)
      .length,
  }
}

/**
 * Tilda o destilda un permiso respetando sus dependencias: operar un módulo
 * exige poder verlo (el servidor lo valida igual), y quitar la lectura quita
 * todo el módulo. Exportaciones no depende de leer nada.
 */
export function applyPermissionToggle(catalog, current, permission, checked) {
  const next = new Set(current)

  if (checked) {
    next.add(permission.key)
    if (permission.action !== 'read' && permission.module !== 'exports') {
      const read = catalog.find(
        (candidate) => candidate.module === permission.module && candidate.action === 'read',
      )
      if (read) next.add(read.key)
    }
  } else {
    next.delete(permission.key)
    if (permission.action === 'read' && permission.module !== 'exports') {
      catalog
        .filter((candidate) => candidate.module === permission.module)
        .forEach((candidate) => next.delete(candidate.key))
    }
  }

  return sortKeysByCatalog(catalog, next)
}

/**
 * Borrador de un toque. Los permisos reservados nunca se agregan; los que el
 * rol ya traía se conservan al limpiar, igual que antes, para no esconder una
 * matriz inconsistente que haya que corregir en el servidor.
 */
export function presetPermissionKeys(preset, catalog, current = []) {
  const reservedHeld = current.filter(isReservedPermission)

  if (preset === 'clear') return sortKeysByCatalog(catalog, new Set(reservedHeld))

  const actions = PRESET_ACTIONS[preset]
  if (!actions) return [...current]

  const keys = new Set(reservedHeld)
  for (const permission of catalog) {
    if (isReservedPermission(permission.key)) continue
    if (permission.module === 'exports') continue
    if (actions.includes(permission.action)) keys.add(permission.key)
  }
  return sortKeysByCatalog(catalog, keys)
}

export function diffPermissions(saved = [], draft = []) {
  const savedSet = new Set(saved)
  const draftSet = new Set(draft)
  return {
    added: draft.filter((key) => !savedSet.has(key)),
    removed: saved.filter((key) => !draftSet.has(key)),
  }
}

export function permissionSignature(keys) {
  return [...(keys ?? [])].sort().join('|')
}

/**
 * Roles agrupados como se leen en la jerarquía: los protegidos (acceso total),
 * los de sistema configurables y los que se crearon a medida.
 */
export function groupRolesByTier(roles = []) {
  const level = (role) => role.hierarchyLevel ?? 3
  const sorted = [...roles].sort(
    (a, b) =>
      level(a) - level(b) ||
      Number(Boolean(b.isSystem)) - Number(Boolean(a.isSystem)) ||
      String(a.name).localeCompare(String(b.name)),
  )
  const groups = [
    { id: 'protected', roles: sorted.filter((role) => role.isProtected) },
    { id: 'system', roles: sorted.filter((role) => !role.isProtected && role.isSystem) },
    { id: 'custom', roles: sorted.filter((role) => !role.isProtected && !role.isSystem) },
  ]
  return groups.filter((group) => group.roles.length > 0)
}
