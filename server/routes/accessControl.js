import { Router } from 'express'
import {
  createAccessRoleSchema,
  updateAccessRolePermissionsSchema,
} from '../../src/lib/schemas/accessControl.js'
import {
  canManageRolePermissions,
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
} from '../services/accessControlService.js'

async function audit(prisma, { action, actorId, entityId, before, after }) {
  await prisma.auditLog.create({
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
        where: { active: true },
        include: roleInclude(),
      })

      res.json({
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

        const role = await prismaClient.$transaction(async (tx) => {
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

          await audit(tx, {
            action: 'access_role.created',
            actorId: req.auth.user.id,
            entityId: created.id,
            before: null,
            after: { name, description, permissionKeys },
          })

          return created
        })

        res.status(201).json({
          role: serializeAccessRole(role, {
            canAssign: canActorAssignRole(req.auth.user, role),
            canManagePermissions: canManageRolePermissions(req.auth.user, role),
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

        const role = await prismaClient.$transaction(async (tx) => {
          await tx.accessRolePermission.deleteMany({ where: { roleId: current.id } })
          if (permissionKeys.length > 0) {
            await tx.accessRolePermission.createMany({
              data: permissionKeys.map((permissionKey) => ({
                roleId: current.id,
                permissionKey,
              })),
            })
          }

          await audit(tx, {
            action: 'access_role.permissions_updated',
            actorId: req.auth.user.id,
            entityId: current.id,
            before: { permissionKeys: before },
            after: { permissionKeys },
          })

          return tx.accessRole.findUnique({
            where: { id: current.id },
            include: roleInclude(),
          })
        })

        res.json({
          role: serializeAccessRole(role, {
            canAssign: canActorAssignRole(req.auth.user, role),
            canManagePermissions: canManageRolePermissions(req.auth.user, role),
          }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
