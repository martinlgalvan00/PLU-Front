export const PERMISSION_CATALOG = [
  {
    key: 'admin.dashboard.read',
    module: 'dashboard',
    moduleLabel: 'Resumen',
    action: 'read',
    actionLabel: 'Ver',
    description: 'Ver indicadores y actividad reciente del panel.',
    sortOrder: 10,
  },
  {
    key: 'admin.athletes.read',
    module: 'athletes',
    moduleLabel: 'Atletas',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar el padrón y el detalle de atletas.',
    sortOrder: 20,
  },
  {
    key: 'admin.athletes.write',
    module: 'athletes',
    moduleLabel: 'Atletas',
    action: 'write',
    actionLabel: 'Escribir',
    description: 'Editar datos y credenciales de atletas.',
    sortOrder: 21,
  },
  {
    key: 'admin.athletes.delete',
    module: 'athletes',
    moduleLabel: 'Atletas',
    action: 'delete',
    actionLabel: 'Eliminar',
    description: 'Eliminar definitivamente atletas y sus datos operativos asociados.',
    sortOrder: 22,
  },
  {
    key: 'admin.memberships.read',
    module: 'memberships',
    moduleLabel: 'Afiliaciones',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar afiliaciones, vigencias y estados.',
    sortOrder: 30,
  },
  {
    key: 'admin.memberships.write',
    module: 'memberships',
    moduleLabel: 'Afiliaciones',
    action: 'write',
    actionLabel: 'Escribir',
    description: 'Gestionar afiliaciones y renovaciones.',
    sortOrder: 31,
  },
  {
    key: 'admin.memberships.delete',
    module: 'memberships',
    moduleLabel: 'Afiliaciones',
    action: 'delete',
    actionLabel: 'Eliminar',
    description: 'Eliminar definitivamente una afiliación y sus dependencias operativas.',
    sortOrder: 32,
  },
  {
    key: 'admin.events.read',
    module: 'events',
    moduleLabel: 'Eventos',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar eventos, capacidad y configuración.',
    sortOrder: 40,
  },
  {
    key: 'admin.events.write',
    module: 'events',
    moduleLabel: 'Eventos',
    action: 'write',
    actionLabel: 'Escribir',
    description: 'Crear y modificar eventos.',
    sortOrder: 41,
  },
  {
    key: 'admin.events.delete',
    module: 'events',
    moduleLabel: 'Eventos',
    action: 'delete',
    actionLabel: 'Eliminar',
    description: 'Eliminar definitivamente eventos y su operación asociada.',
    sortOrder: 42,
  },
  {
    key: 'admin.registrations.read',
    module: 'registrations',
    moduleLabel: 'Inscripciones',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar inscripciones y sus estados.',
    sortOrder: 50,
  },
  {
    key: 'admin.registrations.write',
    module: 'registrations',
    moduleLabel: 'Inscripciones',
    action: 'write',
    actionLabel: 'Escribir',
    description: 'Modificar el estado operativo de inscripciones.',
    sortOrder: 51,
  },
  {
    key: 'admin.registrations.delete',
    module: 'registrations',
    moduleLabel: 'Inscripciones',
    action: 'delete',
    actionLabel: 'Eliminar',
    description: 'Eliminar definitivamente inscripciones y sus acreditaciones.',
    sortOrder: 52,
  },
  {
    key: 'admin.payments.read',
    module: 'payments',
    moduleLabel: 'Pagos',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar órdenes, conciliaciones y comprobantes.',
    sortOrder: 60,
  },
  {
    key: 'admin.payments.approve',
    module: 'payments',
    moduleLabel: 'Pagos',
    action: 'approve',
    actionLabel: 'Aprobar',
    description: 'Aprobar pagos manuales y reintentar operaciones.',
    sortOrder: 61,
  },
  {
    key: 'admin.pricing.read',
    module: 'pricing',
    moduleLabel: 'Tarifas',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar planes de afiliación y ofertas económicas.',
    sortOrder: 65,
  },
  {
    key: 'admin.pricing.write',
    module: 'pricing',
    moduleLabel: 'Tarifas',
    action: 'write',
    actionLabel: 'Gestionar',
    description: 'Publicar versiones de planes y ofertas económicas.',
    sortOrder: 66,
  },
  {
    key: 'admin.shop.read',
    module: 'shop',
    moduleLabel: 'Shop',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar el catálogo y el stock.',
    sortOrder: 70,
  },
  {
    key: 'admin.shop.write',
    module: 'shop',
    moduleLabel: 'Shop',
    action: 'write',
    actionLabel: 'Escribir',
    description: 'Crear, editar y archivar productos.',
    sortOrder: 71,
  },
  {
    key: 'admin.results.read',
    module: 'results',
    moduleLabel: 'Resultados',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar resultados y planillas.',
    sortOrder: 80,
  },
  {
    key: 'admin.results.write',
    module: 'results',
    moduleLabel: 'Resultados',
    action: 'write',
    actionLabel: 'Escribir',
    description: 'Importar y publicar resultados.',
    sortOrder: 81,
  },
  {
    key: 'admin.exports.admin',
    module: 'exports',
    moduleLabel: 'Exportaciones',
    action: 'write',
    actionLabel: 'Operativas',
    description: 'Descargar exportaciones internas de PLU ARG.',
    sortOrder: 90,
  },
  {
    key: 'admin.exports.plu_usa',
    module: 'exports',
    moduleLabel: 'Exportaciones',
    action: 'read',
    actionLabel: 'PLU USA',
    description: 'Descargar el consolidado autorizado para PLU USA.',
    sortOrder: 91,
  },
  {
    key: 'admin.checkin.execute',
    module: 'checkin',
    moduleLabel: 'Check-in',
    action: 'execute',
    actionLabel: 'Operar',
    description: 'Escanear credenciales y registrar ingresos.',
    sortOrder: 100,
  },
  {
    key: 'admin.users.read',
    module: 'users',
    moduleLabel: 'Usuarios',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar cuentas del panel.',
    sortOrder: 110,
  },
  {
    key: 'admin.users.write',
    module: 'users',
    moduleLabel: 'Usuarios',
    action: 'write',
    actionLabel: 'Gestionar',
    description: 'Crear cuentas y asignar roles permitidos.',
    sortOrder: 111,
  },
  {
    key: 'admin.users.delete',
    module: 'users',
    moduleLabel: 'Usuarios',
    action: 'delete',
    actionLabel: 'Eliminar',
    description: 'Eliminar cuentas de staff administrables.',
    sortOrder: 112,
  },
  {
    key: 'admin.roles.read',
    module: 'roles',
    moduleLabel: 'Roles y permisos',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar roles y su matriz de permisos.',
    sortOrder: 120,
  },
  {
    key: 'admin.roles.write',
    module: 'roles',
    moduleLabel: 'Roles y permisos',
    action: 'write',
    actionLabel: 'Gestionar',
    description: 'Crear roles y modificar sus permisos.',
    sortOrder: 121,
  },
  {
    key: 'admin.audit.read',
    module: 'audit',
    moduleLabel: 'Auditoría',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar cambios sensibles del sistema.',
    sortOrder: 130,
  },
  {
    key: 'admin.analytics.read',
    module: 'analytics',
    moduleLabel: 'Analítica',
    action: 'read',
    actionLabel: 'Leer',
    description: 'Consultar tráfico, recorridos y mapa de calor del sitio.',
    sortOrder: 131,
  },
  {
    // Separado de `read` a propósito: el informe agregado no identifica a
    // nadie, pero el recorrido de una persona sí. Quien puede ver métricas de
    // producto no necesariamente puede abrir la navegación de un atleta con
    // nombre y apellido, y cada consulta queda registrada en la auditoría.
    key: 'admin.analytics.identity',
    module: 'analytics',
    moduleLabel: 'Analítica',
    action: 'identity',
    actionLabel: 'Ver recorrido identificado',
    description: 'Abrir el recorrido de navegación de un atleta puntual.',
    sortOrder: 132,
  },
]

export const PERMISSION_KEYS = Object.freeze(PERMISSION_CATALOG.map(({ key }) => key))

export const ROLE_HIERARCHY = Object.freeze([
  'admin_maximal',
  'admin_plu_arg',
  'plu_arg',
  'seguridad_plu_arg',
])

export const CONFIGURABLE_ROLE_KEYS = Object.freeze(['plu_arg', 'seguridad_plu_arg'])

/**
 * Borrado definitivo (cascada de datos, sin vuelta atrás): reservado a Super
 * Admin. Administrador tiene "acceso total" para todo lo demás, pero no esto.
 */
const SUPER_ADMIN_ONLY_PERMISSIONS = Object.freeze([
  'admin.athletes.delete',
  'admin.memberships.delete',
  'admin.events.delete',
  'admin.registrations.delete',
  'admin.users.delete',
])

export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  admin_maximal: PERMISSION_KEYS,
  admin_plu_arg: Object.freeze(
    PERMISSION_KEYS.filter((key) => !SUPER_ADMIN_ONLY_PERMISSIONS.includes(key)),
  ),
  plu_arg: [
    'admin.dashboard.read',
    'admin.athletes.read',
    'admin.memberships.read',
    'admin.events.read',
    'admin.registrations.read',
    'admin.results.read',
    'admin.exports.admin',
  ],
  seguridad_plu_arg: ['admin.events.read', 'admin.checkin.execute'],
})

export const ACCESS_ROLE_TEMPLATES = Object.freeze([
  {
    key: 'admin_maximal',
    name: 'Super Admin',
    description: 'Control total del panel, roles y permisos.',
    baseRole: 'admin_maximal',
    isSystem: true,
    isProtected: true,
    assignableByAdmin: false,
    hierarchyLevel: 1,
  },
  {
    key: 'admin_plu_arg',
    name: 'Administrador',
    description: 'Acceso total y supervisión de permisos para PLU y Seguridad.',
    baseRole: 'admin_plu_arg',
    isSystem: true,
    isProtected: true,
    assignableByAdmin: false,
    hierarchyLevel: 2,
  },
  {
    key: 'plu_arg',
    name: 'PLU',
    description: 'Representación operativa de la federación con permisos configurables.',
    baseRole: 'operador_plu_arg',
    isSystem: true,
    isProtected: false,
    assignableByAdmin: true,
    hierarchyLevel: 3,
  },
  {
    key: 'seguridad_plu_arg',
    name: 'Seguridad',
    description: 'Control de acceso y check-in con alcance configurable.',
    baseRole: 'seguridad_plu_arg',
    isSystem: true,
    isProtected: false,
    assignableByAdmin: true,
    hierarchyLevel: 4,
  },
])

export const ADMIN_SECTION_PERMISSIONS = Object.freeze({
  dashboard: ['admin.dashboard.read'],
  athletes: ['admin.athletes.read'],
  memberships: ['admin.memberships.read'],
  events: ['admin.events.read'],
  registrations: ['admin.registrations.read'],
  grid: ['admin.registrations.read'],
  checkin: ['admin.checkin.execute'],
  results: ['admin.results.read'],
  shop: ['admin.shop.read'],
  payments: ['admin.payments.read'],
  // Finanzas reutiliza la lectura/aprobación de pagos: los ingresos salen del
  // ledger canónico y sólo quien puede validar pagos puede registrar egresos.
  finance: ['admin.payments.read'],
  pricing: ['admin.pricing.read'],
  exports: ['admin.exports.admin', 'admin.exports.plu_usa'],
  users: ['admin.users.read'],
  roles: ['admin.roles.read'],
  audit: ['admin.audit.read'],
  analytics: ['admin.analytics.read'],
  'plu-usa': ['admin.exports.plu_usa'],
})

function subjectPermissionKeys(subject) {
  if (Array.isArray(subject)) return subject
  if (subject && typeof subject === 'object' && Array.isArray(subject.permissions)) {
    return subject.permissions
  }

  const roleKey =
    typeof subject === 'string'
      ? subject
      : subject?.roleKey ?? subject?.accessRole?.key ?? subject?.role

  return DEFAULT_ROLE_PERMISSIONS[roleKey] ?? DEFAULT_ROLE_PERMISSIONS[subject?.role] ?? []
}

export function getAccessRoleKey(subject) {
  if (typeof subject === 'string') return subject
  return subject?.roleKey ?? subject?.accessRole?.key ?? subject?.key ?? subject?.role ?? null
}

export function getRoleHierarchyLevel(subject) {
  const roleKey = getAccessRoleKey(subject)
  const index = ROLE_HIERARCHY.indexOf(roleKey)
  // Los roles personalizados comparten el nivel operativo de PLU. No crean
  // escalones de autoridad nuevos: Super Admin y Administrador siguen siendo
  // los únicos niveles capaces de administrar matrices.
  return index === -1 ? 3 : index + 1
}

export function canManageRolePermissions(actor, targetRole) {
  const actorLevel = getRoleHierarchyLevel(actor)
  const targetKey = getAccessRoleKey(targetRole)
  const targetLevel = getRoleHierarchyLevel(targetRole)
  const targetIsProtected =
    targetRole?.isProtected === true ||
    ['admin_maximal', 'admin_plu_arg'].includes(targetKey)
  const targetIsActive = targetRole?.active !== false

  return (
    actorLevel <= 2 &&
    targetIsActive &&
    Boolean(targetKey) &&
    !targetIsProtected &&
    actorLevel < targetLevel
  )
}

export function canManageRoleLifecycle(actor, targetRole) {
  const actorLevel = getRoleHierarchyLevel(actor)
  const targetKey = getAccessRoleKey(targetRole)
  const protectedRole = targetRole?.isProtected === true || ['admin_maximal', 'admin_plu_arg'].includes(targetKey)
  return actorLevel <= 2 && Boolean(targetKey) && !protectedRole && actorLevel < getRoleHierarchyLevel(targetRole)
}

export function hasPermission(subject, permissionKey) {
  return subjectPermissionKeys(subject).includes(permissionKey)
}

export function hasAnyPermission(subject, permissionKeys) {
  return permissionKeys.some((permissionKey) => hasPermission(subject, permissionKey))
}

export function hasEventScopeAccess(subject, { eventId = null, eventSlug = null } = {}) {
  if (!hasPermission(subject, 'admin.checkin.execute')) return false

  const assignedEventId =
    subject && typeof subject === 'object' ? subject.eventId : null
  const assignedEventSlug =
    subject && typeof subject === 'object' ? subject.eventSlug : null

  if (!assignedEventId && !assignedEventSlug) return true
  if (assignedEventId && eventId) return assignedEventId === eventId
  if (assignedEventSlug && eventSlug) return assignedEventSlug === eventSlug
  return false
}

export function canAccessSecurityEvent(subject, eventSlug) {
  if (!eventSlug) return false
  return hasEventScopeAccess(subject, { eventSlug })
}

export function getAllowedAdminSections(subject) {
  return Object.entries(ADMIN_SECTION_PERMISSIONS)
    .filter(([, permissionKeys]) => hasAnyPermission(subject, permissionKeys))
    .map(([section]) => section)
}

export function getDefaultPermissionsForRole(roleKey) {
  return [...(DEFAULT_ROLE_PERMISSIONS[roleKey] ?? [])]
}
