import {
  ACCESS_ROLE_TEMPLATES,
  canManageRolePermissions,
  getAccessRoleKey,
  getDefaultPermissionsForRole,
  getRoleHierarchyLevel,
  PERMISSION_CATALOG,
} from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'

export const ACCESS_ROLE_INCLUDE = {
  permissions: {
    include: { permission: true },
    orderBy: { permission: { sortOrder: 'asc' } },
  },
}

function templateRole(roleKey) {
  const template = ACCESS_ROLE_TEMPLATES.find(({ key }) => key === roleKey)
  if (!template) return null

  return {
    id: template.key,
    ...template,
    active: true,
    permissions: getDefaultPermissionsForRole(roleKey).map((permissionKey) => ({
      permission: PERMISSION_CATALOG.find(({ key }) => key === permissionKey) ?? {
        key: permissionKey,
      },
    })),
  }
}

export function permissionKeysFromAccessRole(accessRole) {
  if (!accessRole?.permissions) return null

  return accessRole.permissions
    .map((grant) => grant.permission?.key ?? grant.permissionKey ?? grant.key)
    .filter(Boolean)
}

export function serializeAccessRole(
  role,
  { canAssign = false, canManagePermissions = false } = {},
) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description ?? '',
    baseRole: role.baseRole,
    isSystem: Boolean(role.isSystem),
    isProtected: Boolean(role.isProtected),
    assignableByAdmin: Boolean(role.assignableByAdmin),
    active: role.active !== false,
    hierarchyLevel: getRoleHierarchyLevel(role),
    permissions: permissionKeysFromAccessRole(role) ?? [],
    userCount: role._count?.users ?? 0,
    canAssign,
    canManagePermissions,
  }
}

function permissionKeysFromSnapshot(snapshot) {
  return Array.isArray(snapshot?.permissionKeys)
    ? snapshot.permissionKeys.filter((permissionKey) => typeof permissionKey === 'string')
    : []
}

export function serializeAccessRoleActivity(log, { actor = null, roleName = null } = {}) {
  const beforePermissions = permissionKeysFromSnapshot(log.before)
  const afterPermissions = permissionKeysFromSnapshot(log.after)
  const beforeSet = new Set(beforePermissions)
  const afterSet = new Set(afterPermissions)
  const resolvedActor = log.actor ?? actor
  const createdAt =
    log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt ?? '')

  return {
    id: log.id,
    action: log.action,
    roleId: log.entityId,
    roleName: roleName ?? log.after?.name ?? log.entityId,
    actorName:
      resolvedActor?.profile?.displayName ?? resolvedActor?.name ?? resolvedActor?.email ?? null,
    createdAt,
    addedPermissions: afterPermissions.filter((permissionKey) => !beforeSet.has(permissionKey)),
    removedPermissions: beforePermissions.filter((permissionKey) => !afterSet.has(permissionKey)),
  }
}

export async function findAccessRole(prisma, roleKey) {
  if (prisma.accessRole?.findUnique) {
    return prisma.accessRole.findUnique({
      where: { key: roleKey },
      include: ACCESS_ROLE_INCLUDE,
    })
  }

  return templateRole(roleKey)
}

/**
 * Quién puede asignar qué rol, por jerarquía.
 *
 * Super Admin es el único nivel que puede replicarse a sí mismo. Sin esa
 * excepción no habría forma de dar de alta un segundo Super Admin desde la
 * aplicación -- que es exactamente el agujero que dejaba el alta anterior,
 * donde `admin_maximal` estaba reservado al seed.
 *
 * Para todos los demás vale la regla estándar: sólo se asigna estrictamente
 * por debajo del propio nivel. Un Administrador crea PLU, Seguridad y roles
 * personalizados, pero nunca otro Administrador ni un Super Admin.
 */
export function canActorAssignRole(actor, targetRole) {
  if (!targetRole?.active) return false

  const actorKey = getAccessRoleKey(actor)
  if (actorKey === 'admin_maximal') return true
  if (targetRole.key === 'admin_maximal') return false

  const actorLevel = getRoleHierarchyLevel(actor)
  return (
    actorLevel <= 2 &&
    targetRole.assignableByAdmin === true &&
    actorLevel < getRoleHierarchyLevel(targetRole)
  )
}

export async function resolveAssignableRole(prisma, actor, roleKey) {
  const role = await findAccessRole(prisma, roleKey)
  if (!role) throw new HttpError(400, 'El rol seleccionado no existe.')
  if (!canActorAssignRole(actor, role)) {
    throw new HttpError(403, 'No tenés permisos para asignar ese rol.')
  }
  return role
}

export function assertMutablePermissionSet(actor, role, permissionKeys) {
  if (!canManageRolePermissions(actor, role)) {
    throw new HttpError(403, 'No tenés jerarquía suficiente para modificar este rol.')
  }

  const reservedPermissions = ['admin.users.write', 'admin.roles.write', 'admin.pricing.write']
  if (permissionKeys.some((permissionKey) => reservedPermissions.includes(permissionKey))) {
    throw new HttpError(
      400,
      'La gestión de usuarios, roles y tarifas queda reservada a Super Admin y Administrador.',
    )
  }

  const selected = new Set(permissionKeys)
  for (const permissionKey of permissionKeys) {
    const permission = PERMISSION_CATALOG.find(({ key }) => key === permissionKey)
    if (!permission || permission.action === 'read' || permission.module === 'exports') continue

    const readPermission = PERMISSION_CATALOG.find(
      (candidate) => candidate.module === permission.module && candidate.action === 'read',
    )
    if (readPermission && !selected.has(readPermission.key)) {
      throw new HttpError(
        400,
        `Para operar ${permission.moduleLabel} también tenés que habilitar Lectura.`,
      )
    }
  }
}
