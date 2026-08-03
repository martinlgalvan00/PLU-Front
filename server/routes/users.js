import { Router } from 'express'
import { updateUserAccessRoleSchema } from '../../src/lib/schemas/accessControl.js'
import { createStaffUserSchema, updateStaffUserStatusSchema } from '../../src/lib/schemas/auth.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import {
  ACCESS_ROLE_INCLUDE,
  resolveAssignableRole,
} from '../services/accessControlService.js'
import { revokeSessionsForUser, serializeUser } from '../services/sessionService.js'

// Los roles configurables conservan uno de estos roles base para Auth y las
// integraciones existentes. Seguridad se administra por evento en /api/auth.
const STAFF_LIST_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'viewer_plu_usa']

function splitName(name) {
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') || firstName }
}

function userInclude() {
  return {
    profile: true,
    accessRole: { include: ACCESS_ROLE_INCLUDE },
  }
}

async function auditRoleAssignment(prisma, { actorId, userId, beforeRoleKey, afterRoleKey }) {
  if (!prisma.auditLog?.create) return

  await prisma.auditLog.create({
    data: {
      action: 'user.access_role_assigned',
      entityType: 'user',
      entityId: userId,
      actorId,
      before: beforeRoleKey ? { roleKey: beforeRoleKey } : null,
      after: { roleKey: afterRoleKey },
    },
  })
}

async function auditStatusChange(prisma, { actorId, userId, beforeStatus, afterStatus }) {
  if (!prisma.auditLog?.create) return

  await prisma.auditLog.create({
    data: {
      action: 'user.status_changed',
      entityType: 'user',
      entityId: userId,
      actorId,
      before: { status: beforeStatus },
      after: { status: afterStatus },
    },
  })
}

export function createUserRoutes({ getPrisma }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.users.read', { prisma })
  const writeGuard = requirePermission('admin.users.write', { prisma })

  router.get('/', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      const prismaClient = getPrisma()
      const users = await prismaClient.user.findMany({
        where: { role: { in: STAFF_LIST_ROLES } },
        include: userInclude(),
        orderBy: { createdAt: 'desc' },
      })
      res.json({ users: users.map(serializeUser) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/',
    ...writeGuard,
    staffLimiter,
    validateBody(createStaffUserSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        const { name, email, role: roleKey } = req.validatedBody

        const existing = await prismaClient.user.findUnique({ where: { email } })
        if (existing) throw new HttpError(409, 'Ya existe un usuario con ese email.')
        if (roleKey === 'admin_maximal') {
          throw new HttpError(400, 'El rol Super Admin se reserva al proceso de seed.')
        }

        const accessRole = await resolveAssignableRole(prismaClient, req.auth.user, roleKey)
        if (accessRole.key === 'seguridad_plu_arg') {
          throw new HttpError(400, 'Las cuentas de Seguridad se crean desde un evento.')
        }

        const { firstName, lastName } = splitName(name)
        const created = await prismaClient.user.create({
          data: {
            email,
            role: accessRole.baseRole,
            ...(prismaClient.accessRole
              ? { accessRole: { connect: { id: accessRole.id } } }
              : {}),
            status: 'active',
            profile: {
              create: { firstName, lastName, displayName: `${firstName} ${lastName}`.trim() },
            },
          },
          include: userInclude(),
        })

        await auditRoleAssignment(prismaClient, {
          actorId: req.auth.user.id,
          userId: created.id,
          beforeRoleKey: null,
          afterRoleKey: accessRole.key,
        })

        res.status(201).json({
          user: serializeUser(created.accessRole?.key ? created : { ...created, accessRole }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/:userId/role',
    ...writeGuard,
    staffLimiter,
    validateBody(updateUserAccessRoleSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        if (req.params.userId === req.auth.user.id) {
          throw new HttpError(400, 'No podés cambiar tu propio rol.')
        }

        const target = await prismaClient.user.findUnique({
          where: { id: req.params.userId },
          include: userInclude(),
        })
        if (!target) throw new HttpError(404, 'El usuario no existe.')
        if (target.role === 'admin_maximal') {
          throw new HttpError(403, 'El rol del Super Admin no se modifica desde el panel.')
        }

        const accessRole = await resolveAssignableRole(
          prismaClient,
          req.auth.user,
          req.validatedBody.roleKey,
        )
        if (accessRole.key === 'seguridad_plu_arg') {
          throw new HttpError(400, 'Asigná Seguridad desde el evento correspondiente.')
        }

        const beforeRoleKey = target.accessRole?.key ?? target.role
        const updated = await prismaClient.user.update({
          where: { id: target.id },
          data: {
            role: accessRole.baseRole,
            ...(prismaClient.accessRole
              ? { accessRole: { connect: { id: accessRole.id } } }
              : {}),
            eventId: null,
            eventSlug: null,
          },
          include: userInclude(),
        })

        await auditRoleAssignment(prismaClient, {
          actorId: req.auth.user.id,
          userId: target.id,
          beforeRoleKey,
          afterRoleKey: accessRole.key,
        })

        // El rol nuevo tiene que valer ya: se cortan las sesiones abiertas del
        // usuario para que su próximo request se resuelva con la matriz nueva.
        await revokeSessionsForUser({ prisma: prismaClient, userId: target.id })

        res.json({
          user: serializeUser(updated.accessRole?.key ? updated : { ...updated, accessRole }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/:userId/status',
    ...writeGuard,
    staffLimiter,
    validateBody(updateStaffUserStatusSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        if (req.params.userId === req.auth.user.id) {
          throw new HttpError(400, 'No podés cambiar el estado de tu propia cuenta.')
        }

        const target = await prismaClient.user.findUnique({
          where: { id: req.params.userId },
          include: userInclude(),
        })
        if (!target) throw new HttpError(404, 'El usuario no existe.')
        if (target.role === 'admin_maximal') {
          throw new HttpError(403, 'El estado del Super Admin no se modifica desde el panel.')
        }
        if (!STAFF_LIST_ROLES.includes(target.role)) {
          throw new HttpError(400, 'Esa cuenta no se administra desde Usuarios.')
        }

        const nextStatus = req.validatedBody.status
        if (target.status === nextStatus) {
          res.json({
            user: serializeUser(
              target.accessRole?.key ? target : { ...target, accessRole: target.accessRole },
            ),
          })
          return
        }

        const updated = await prismaClient.user.update({
          where: { id: target.id },
          data: { status: nextStatus },
          include: userInclude(),
        })

        await auditStatusChange(prismaClient, {
          actorId: req.auth.user.id,
          userId: target.id,
          beforeStatus: target.status,
          afterStatus: nextStatus,
        })

        // Suspendido o dado de baja: cortar sesiones ya. Activar no requiere
        // revocar — el usuario vuelve a entrar con un login nuevo.
        if (nextStatus !== 'active') {
          await revokeSessionsForUser({ prisma: prismaClient, userId: target.id })
        }

        res.json({
          user: serializeUser(
            updated.accessRole?.key ? updated : { ...updated, accessRole: updated.accessRole },
          ),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
