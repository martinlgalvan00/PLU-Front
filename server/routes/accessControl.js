import { Router } from 'express'
import {
  createAccessRoleSchema,
  updateAccessRolePermissionsSchema,
  updateAccessRoleStatusSchema,
} from '../../src/lib/schemas/accessControl.js'
import {
  canManageRoleLifecycle,
  canManageRolePermissions,
  hasPermission,
  PERMISSION_CATALOG,
} from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import {
  ACCESS_ROLE_INCLUDE,
  assertMutablePermissionSet,
  canActorAssignRole,
  serializeAccessRole,
  serializeAccessRoleActivity,
} from '../services/accessControlService.js'

async function audit(prisma, { action, actorId, entityId, before, after }) {
  return prisma.auditLog.create({
    data: {
      action,
      entityType: 'access_role',
      entityId,
      actorId,
      before,
      after,
    },
  })
}

function roleInclude() {
  return {
    ...ACCESS_ROLE_INCLUDE,
    _count: { select: { users: true } },
  }
}

const ACCESS_ROLE_AUDIT_ACTIONS = [
  'access_role.created',
  'access_role.permissions_updated',
  'access_role.hierarchy_configured',
  'access_role.status_updated',
]

async function listRecentRoleActivity(prisma, actor, roles) {
  if (
    !hasPermission(actor, 'admin.audit.read') ||
    typeof prisma.auditLog?.findMany !== 'function'
  ) {
    return []
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: 'access_role',
      action: { in: ACCESS_ROLE_AUDIT_ACTIONS },
    },
    include: {
      actor: {
        include: { profile: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const roleNames = new Map(roles.map((role) => [role.id, role.name]))

  return logs.map((log) =>
    serializeAccessRoleActivity(log, {
      roleName: roleNames.get(log.entityId) ?? null,
    }),
  )
}

function roleKeyBase(name) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return `custom_${normalized || 'rol'}`.slice(0, 48).replace(/_+$/g, '')
}

async function availableRoleKey(prisma, name) {
  const base = roleKeyBase(name)

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const candidate = `${base.slice(0, 48 - suffix.length)}${suffix}`
    const existing = await prisma.accessRole.findUnique({ where: { key: candidate } })
    if (!existing) return candidate
  }

  throw new HttpError(409, 'No se pudo generar una clave única para el rol.')
}

export function createAccessControlRoutes({ getPrisma }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.roles.read', { prisma })
  const writeGuard = requirePermission('admin.roles.write', { prisma })

  router.get('/', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const roles = await prisma.accessRole.findMany({
        include: roleInclude(),
      })
      const activity = await listRecentRoleActivity(prisma, req.auth.user, roles)

      res.json({
        activity,
        permissions: PERMISSION_CATALOG,
        roles: roles
          .map((role) =>
            serializeAccessRole(role, {
              canAssign: canActorAssignRole(req.auth.user, role),
              canManagePermissions: canManageRolePermissions(req.auth.user, role),
            }),
          )
          .sort(
            (a, b) =>
              a.hierarchyLevel - b.hierarchyLevel ||
              Number(b.isSystem) - Number(a.isSystem) ||
              a.name.localeCompare(b.name, 'es'),
          ),
      })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/',
    ...writeGuard,
    staffLimiter,
    validateBody(createAccessRoleSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        const { name, description, permissionKeys } = req.validatedBody
        const key = await availableRoleKey(prismaClient, name)
        const definition = {
          id: key,
          key,
          name,
          description,
          baseRole: 'operador_plu_arg',
          isSystem: false,
          isProtected: false,
          assignableByAdmin: true,
          active: true,
        }

        assertMutablePermissionSet(req.auth.user, definition, permissionKeys)

        const result = await prismaClient.$transaction(async (tx) => {
          const created = await tx.accessRole.create({
            data: {
              ...definition,
              ...(permissionKeys.length > 0
                ? {
                    permissions: {
                      create: permissionKeys.map((permissionKey) => ({
                        permission: { connect: { key: permissionKey } },
                      })),
                    },
                  }
                : {}),
            },
            include: roleInclude(),
          })

          const activity = await audit(tx, {
            action: 'access_role.created',
            actorId: req.auth.user.id,
            entityId: created.id,
            before: null,
            after: { name, description, permissionKeys },
          })

          return { activity, role: created }
        })

        res.status(201).json({
          activity: serializeAccessRoleActivity(result.activity, {
            actor: req.auth.user,
            roleName: result.role.name,
          }),
          role: serializeAccessRole(result.role, {
            canAssign: canActorAssignRole(req.auth.user, result.role),
            canManagePermissions: canManageRolePermissions(req.auth.user, result.role),
          }),
        })
      } catch (error) {
        if (error?.code === 'P2002') {
          next(new HttpError(409, 'Ya existe un rol con esa clave.'))
          return
        }
        next(error)
      }
    },
  )

  router.patch(
    '/:roleId/status',
    ...writeGuard,
    staffLimiter,
    validateBody(updateAccessRoleStatusSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        const current = await prismaClient.accessRole.findUnique({
          where: { id: req.params.roleId },
          include: roleInclude(),
        })
        if (!current) throw new HttpError(404, 'El rol no existe.')
        if (!canManageRoleLifecycle(req.auth.user, current)) {
          throw new HttpError(
            403,
            'No tenés jerarquía suficiente para activar o desactivar este rol.',
          )
        }

        const active = req.validatedBody.active
        const result = await prismaClient.$transaction(async (tx) => {
          const role = await tx.accessRole.update({
            where: { id: current.id },
            data: { active },
            include: roleInclude(),
          })
          const activity = await audit(tx, {
            action: 'access_role.status_updated',
            actorId: req.auth.user.id,
            entityId: current.id,
            before: { active: current.active },
            after: { active },
          })
          if (!active && typeof tx.session?.updateMany === 'function') {
            await tx.session.updateMany({
              where: { revokedAt: null, user: { accessRoleId: current.id } },
              data: { revokedAt: new Date() },
            })
          }
          return { activity, role }
        })

        res.json({
          activity: serializeAccessRoleActivity(result.activity, {
            actor: req.auth.user,
            roleName: result.role.name,
          }),
          role: serializeAccessRole(result.role, {
            canAssign: canActorAssignRole(req.auth.user, result.role),
            canManagePermissions: canManageRolePermissions(req.auth.user, result.role),
          }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/:roleId/permissions',
    ...writeGuard,
    staffLimiter,
    validateBody(updateAccessRolePermissionsSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        const current = await prismaClient.accessRole.findUnique({
          where: { id: req.params.roleId },
          include: roleInclude(),
        })
        if (!current || !current.active) throw new HttpError(404, 'El rol no existe.')

        const { permissionKeys } = req.validatedBody
        assertMutablePermissionSet(req.auth.user, current, permissionKeys)
        const before = current.permissions
          .map((grant) => grant.permission?.key ?? grant.permissionKey)
          .filter(Boolean)

        const result = await prismaClient.$transaction(async (tx) => {
          await tx.accessRolePermission.deleteMany({ where: { roleId: current.id } })
          if (permissionKeys.length > 0) {
            await tx.accessRolePermission.createMany({
              data: permissionKeys.map((permissionKey) => ({
                roleId: current.id,
                permissionKey,
              })),
            })
          }

          const activity = await audit(tx, {
            action: 'access_role.permissions_updated',
            actorId: req.auth.user.id,
            entityId: current.id,
            before: { permissionKeys: before },
            after: { permissionKeys },
          })

          const role = await tx.accessRole.findUnique({
            where: { id: current.id },
            include: roleInclude(),
          })

          return { activity, role }
        })

        res.json({
          activity: serializeAccessRoleActivity(result.activity, {
            actor: req.auth.user,
            roleName: result.role.name,
          }),
          role: serializeAccessRole(result.role, {
            canAssign: canActorAssignRole(req.auth.user, result.role),
            canManagePermissions: canManageRolePermissions(req.auth.user, result.role),
          }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
