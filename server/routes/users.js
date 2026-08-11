import { Router } from 'express'
import { getRoleHierarchyLevel } from '../../src/lib/permissions.js'
import { updateUserAccessRoleSchema } from '../../src/lib/schemas/accessControl.js'
import {
  createStaffUserSchema,
  resetStaffPasswordSchema,
  updateStaffUserStatusSchema,
} from '../../src/lib/schemas/auth.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission, requireRole } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createStaffAccountNotificationService } from '../modules/notifications/staffAccountNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  ACCESS_ROLE_INCLUDE,
  resolveAssignableRole,
} from '../services/accessControlService.js'
import {
  generateTempPassword,
  hashPassword,
  TEMP_PASSWORD_TTL_DAYS,
  tempPasswordExpiry,
} from '../services/passwordService.js'
import { revokeSessionsForUser, serializeUser } from '../services/sessionService.js'
import { deleteStaffUser } from '../services/staffUserDeletionService.js'

// Los roles configurables conservan uno de estos roles base para Auth y las
// integraciones existentes. Seguridad se administra por evento en /api/auth.
const STAFF_LIST_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'viewer_plu_usa']
const DELETABLE_STAFF_ROLES = [...STAFF_LIST_ROLES, 'seguridad_plu_arg']

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

async function auditCredentialIssued(prisma, { actorId, userId, reason }) {
  if (!prisma.auditLog?.create) return

  await prisma.auditLog.create({
    data: {
      action: 'user.credential_issued',
      entityType: 'user',
      entityId: userId,
      actorId,
      before: null,
      // La contraseña nunca se persiste en el log: sólo el hecho de que se
      // emitió una y por qué.
      after: { reason },
    },
  })
}

export function createUserRoutes({ getPrisma, getSupabaseAdmin, brevo, notificationRepository, env }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.users.read', { prisma })
  const writeGuard = requirePermission('admin.users.write', { prisma })
  const deleteGuard = requireRole(['admin_maximal'], { prisma })

  // Igual que en routes/auth.js: en producción estas dependencias no se
  // inyectan, así que se construyen acá. Sin Supabase se sigue sin repositorio
  // (modo degradado, sin log de emails) en vez de romper el armado de la app.
  function resolveNotificationRepository() {
    if (notificationRepository) return notificationRepository
    try {
      const client = getSupabaseAdmin?.()
      return client ? createSupabaseNotificationRepository(client) : null
    } catch {
      return null
    }
  }

  const staffNotifications = createStaffAccountNotificationService({
    repository: resolveNotificationRepository(),
    brevo: brevo ?? createBrevoAdapter({ env: env ?? process.env }),
    env: env ?? process.env,
  })

  // Best-effort: el alta ya se confirmó en la base antes de llegar acá, así
  // que un fallo de Brevo no puede tirar el request. Devuelve true sólo si el
  // envío se confirmó; con false el panel muestra la clave en pantalla.
  async function dispatchInvitation(payload) {
    try {
      const result = await staffNotifications.notifyStaffInvitation(payload)
      return result?.status === 'sent' || result?.emailLog?.status === 'sent'
    } catch {
      return false
    }
  }

  async function issueTempPassword() {
    const tempPassword = generateTempPassword()
    return {
      tempPassword,
      passwordHash: await hashPassword(tempPassword),
      passwordExpiresAt: tempPasswordExpiry(),
    }
  }

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
        const { name, email, role: roleKey, sendEmail } = req.validatedBody

        const existing = await prismaClient.user.findUnique({ where: { email } })
        if (existing) throw new HttpError(409, 'Ya existe un usuario con ese email.')

        // Super Admin ya no queda reservado al seed: resolveAssignableRole
        // decide por jerarquía (sólo otro Super Admin puede crearlo).
        const accessRole = await resolveAssignableRole(prismaClient, req.auth.user, roleKey)
        if (accessRole.key === 'seguridad_plu_arg') {
          throw new HttpError(400, 'Las cuentas de Seguridad se crean desde un evento.')
        }

        const { firstName, lastName } = splitName(name)
        const { tempPassword, passwordHash, passwordExpiresAt } = await issueTempPassword()
        const created = await prismaClient.user.create({
          data: {
            email,
            passwordHash,
            mustChangePassword: true,
            passwordExpiresAt,
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
        await auditCredentialIssued(prismaClient, {
          actorId: req.auth.user.id,
          userId: created.id,
          reason: 'invitation',
        })

        const user = serializeUser(created.accessRole?.key ? created : { ...created, accessRole })
        const emailed = sendEmail
          ? await dispatchInvitation({
              user,
              tempPassword,
              roleName: accessRole.name,
              expiresInDays: TEMP_PASSWORD_TTL_DAYS,
            })
          : false

        res.status(201).json({ user, tempPassword, emailed })
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

  // Reenvío de invitación / reseteo de credencial. Emite una contraseña
  // temporal nueva, vuelve a exigir el cambio y corta las sesiones abiertas:
  // si se resetea porque la credencial se filtró, dejar viva la sesión del
  // atacante haría inútil el reseteo.
  router.post(
    '/:userId/reset-password',
    ...writeGuard,
    staffLimiter,
    validateBody(resetStaffPasswordSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        if (req.params.userId === req.auth.user.id) {
          throw new HttpError(400, 'Para cambiar tu propia contraseña usá Mi cuenta.')
        }

        const target = await prismaClient.user.findUnique({
          where: { id: req.params.userId },
          include: userInclude(),
        })
        if (!target) throw new HttpError(404, 'El usuario no existe.')
        if (!STAFF_LIST_ROLES.includes(target.role)) {
          throw new HttpError(400, 'Esa cuenta no se administra desde Usuarios.')
        }

        // Emitir una credencial es tomar control de la cuenta, así que se
        // exige superar en jerarquía al titular. No se reusa
        // `resolveAssignableRole` porque ahí la clave es la del AccessRole
        // (`plu_arg`) y una cuenta sin fila de rol sólo tiene su baseRole
        // (`operador_plu_arg`), que no existe en ese catálogo.
        const actorLevel = getRoleHierarchyLevel(req.auth.user)
        const targetLevel = getRoleHierarchyLevel(target)
        // Super Admin es el único que puede hacerlo sobre otro Super Admin: si
        // no, una cuenta de ese nivel que pierde su clave queda muerta.
        if (!(actorLevel === 1 || (actorLevel === 2 && targetLevel > 2))) {
          throw new HttpError(403, 'No tenés jerarquía suficiente sobre esa cuenta.')
        }

        const { tempPassword, passwordHash, passwordExpiresAt } = await issueTempPassword()
        const updated = await prismaClient.user.update({
          where: { id: target.id },
          data: { passwordHash, mustChangePassword: true, passwordExpiresAt },
          include: userInclude(),
        })

        await auditCredentialIssued(prismaClient, {
          actorId: req.auth.user.id,
          userId: target.id,
          reason: 'reset',
        })
        await revokeSessionsForUser({ prisma: prismaClient, userId: target.id })

        const user = serializeUser(updated)
        const emailed = req.validatedBody.sendEmail
          ? await dispatchInvitation({
              user,
              tempPassword,
              roleName: updated.accessRole?.name ?? null,
              expiresInDays: TEMP_PASSWORD_TTL_DAYS,
            })
          : false

        res.json({ user, tempPassword, emailed })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete('/:userId', ...deleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const prismaClient = getPrisma()
      if (req.params.userId === req.auth.user.id) {
        throw new HttpError(400, 'No podés eliminar tu propia cuenta.')
      }

      const target = await prismaClient.user.findUnique({
        where: { id: req.params.userId },
        include: userInclude(),
      })
      if (!target) throw new HttpError(404, 'El usuario no existe.')
      if (target.role === 'admin_maximal') {
        throw new HttpError(403, 'No se puede eliminar otra cuenta Super Admin.')
      }
      if (!DELETABLE_STAFF_ROLES.includes(target.role)) {
        throw new HttpError(400, 'Esa cuenta no pertenece al staff administrable.')
      }

      const deletedUser = await deleteStaffUser({
        prisma: prismaClient,
        actorId: req.auth.user.id,
        target,
      })

      res.json({ deletedUser })
    } catch (error) {
      next(error)
    }
  })

  return router
}
