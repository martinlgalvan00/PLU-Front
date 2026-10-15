import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { getRoleHierarchyLevel, isEventScopedRole } from '../../src/lib/permissions.js'
import {
  buildPendingInviteEmail,
  buildStaffInvitationUrl,
  isPendingInviteEmail,
  PENDING_INVITE_NAME,
} from '../../src/lib/staffInvitationRoute.js'
import {
  bulkUserAccessRoleSchema,
  updateUserAccessRoleSchema,
} from '../../src/lib/schemas/accessControl.js'
import {
  createStaffUserSchema,
  resetStaffPasswordSchema,
  updateStaffUserStatusSchema,
} from '../../src/lib/schemas/auth.js'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { staffSessionCache } from '../lib/sessionCache.js'
import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createStaffAccountNotificationService } from '../modules/notifications/staffAccountNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../modules/audit/operationalAuditWriter.js'
import { ACCESS_ROLE_INCLUDE, resolveAssignableRole } from '../services/accessControlService.js'
import {
  generateTempPassword,
  hashPassword,
  TEMP_PASSWORD_TTL_DAYS,
  tempPasswordExpiry,
} from '../services/passwordService.js'
import { fetchSupabaseEventsByIds } from '../services/securityEventService.js'
import { revokeSessionsForUser, serializeUser } from '../services/sessionService.js'
import {
  createStaffInvitationToken,
  staffInvitationFingerprint,
} from '../services/staffInvitationToken.js'
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

/**
 * Reemplaza el grant de eventos de un organizador. Los eventos viven en Supabase:
 * se resuelven ahí (slug actual) antes de tocar Prisma.
 */
async function replaceUserEventAccess(prisma, getSupabaseAdmin, { userId, eventIds, actorId }) {
  const uniqueIds = [...new Set(eventIds)]
  const events = await fetchSupabaseEventsByIds(getSupabaseAdmin?.(), uniqueIds)
  const missing = uniqueIds.filter((id) => !events.has(id))
  if (missing.length > 0) {
    throw new HttpError(400, 'Hay eventos que no existen.', {
      code: 'EVENT_NOT_FOUND',
      fields: { eventIds: 'Elegí eventos que existan.' },
    })
  }

  const before =
    typeof prisma.userEventAccess?.findMany === 'function'
      ? await prisma.userEventAccess.findMany({
          where: { userId },
          select: { eventId: true, eventSlug: true },
        })
      : []
  const alreadyAssigned = new Set(before.map((row) => row.eventId))

  if (typeof prisma.userEventAccess?.deleteMany === 'function') {
    await prisma.userEventAccess.deleteMany({
      where: { userId, eventId: { notIn: uniqueIds } },
    })
  }
  const toCreate = uniqueIds
    .filter((id) => !alreadyAssigned.has(id))
    .map((id) => ({
      userId,
      eventId: id,
      eventSlug: events.get(id).slug,
      grantedBy: actorId,
    }))
  if (toCreate.length > 0 && typeof prisma.userEventAccess?.createMany === 'function') {
    await prisma.userEventAccess.createMany({ data: toCreate, skipDuplicates: true })
  }
  for (const row of before) {
    const current = events.get(row.eventId)
    if (current && current.slug !== row.eventSlug && typeof prisma.userEventAccess?.updateMany === 'function') {
      await prisma.userEventAccess.updateMany({
        where: { userId, eventId: row.eventId },
        data: { eventSlug: current.slug },
      })
    }
  }

  const after =
    typeof prisma.userEventAccess?.findMany === 'function'
      ? await prisma.userEventAccess.findMany({
          where: { userId },
          select: { eventId: true, eventSlug: true },
        })
      : []

  if (prisma.auditLog?.create) {
    await prisma.auditLog.create({
      data: {
        action: 'user.event_access_changed',
        entityType: 'user',
        entityId: userId,
        actorId,
        before: { eventSlugs: before.map((row) => row.eventSlug) },
        after: { eventSlugs: after.map((row) => row.eventSlug) },
      },
    })
  }

  return after
}

// Cola común del cambio de rol (individual y en lote): aplica el rol, lo deja en
// auditoría y corta las sesiones abiertas para que el próximo request se
// resuelva con la matriz nueva. Las validaciones previas son de quien llama.
async function applyRoleChange(prisma, getSupabaseAdmin, { actorId, target, accessRole, eventIds }) {
  const beforeRoleKey = target.accessRole?.key ?? target.role
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      role: accessRole.baseRole,
      ...(prisma.accessRole ? { accessRole: { connect: { id: accessRole.id } } } : {}),
      eventId: null,
      eventSlug: null,
    },
    include: userInclude(),
  })

  await auditRoleAssignment(prisma, {
    actorId,
    userId: target.id,
    beforeRoleKey,
    afterRoleKey: accessRole.key,
  })

  // Salir del rol por evento borra sus eventos asignados: si no, volver a asignarlo
  // meses después le devolvería en silencio acceso a eventos que ya no recordamos.
  if (!isEventScopedRole(accessRole) && typeof prisma.userEventAccess?.deleteMany === 'function') {
    await prisma.userEventAccess.deleteMany({ where: { userId: target.id } })
  }

  let eventAccess = []
  if (isEventScopedRole(accessRole) && Array.isArray(eventIds) && eventIds.length > 0) {
    eventAccess = await replaceUserEventAccess(prisma, getSupabaseAdmin, {
      userId: target.id,
      eventIds,
      actorId,
    })
  }

  await revokeSessionsForUser({ prisma, userId: target.id })

  const user = serializeUser(updated.accessRole?.key ? updated : { ...updated, accessRole })
  if (isEventScopedRole(accessRole)) {
    return { ...user, eventAccess }
  }
  return user
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

export function createUserRoutes({
  getPrisma,
  getSupabaseAdmin,
  brevo,
  notificationRepository,
  env,
}) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.users.read', { prisma })
  const writeGuard = requirePermission('admin.users.write', { prisma })
  const deleteGuard = requirePermission('admin.users.delete', { prisma })

  async function recordIdentity(event, req) {
    let client = null
    try {
      client = getSupabaseAdmin?.() ?? null
    } catch {
      client = null
    }
    return recordOperationalAuditEvent(client, {
      source: 'identity',
      ...event,
      metadata: requestAuditMetadata(req, event.metadata),
    })
  }

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
  // que un fallo de Brevo no puede tirar el request. La invitación se puede
  // reemitir desde Usuarios sin exponer contraseñas ni tokens en la respuesta.
  async function dispatchInvitation(payload) {
    // Una invitación abierta no tiene destinatario: no hay a quién mandarle mail.
    if (isPendingInviteEmail(payload.user?.email)) return false
    try {
      const result = await staffNotifications.notifyStaffInvitation(payload)
      return result?.status === 'sent' || result?.emailLog?.status === 'sent'
    } catch {
      return false
    }
  }

  async function issueInvitationCredential() {
    // La credencial aleatoria existe sólo para versionar/inutilizar la
    // invitación. Nunca se devuelve, loguea ni manda por email.
    const internalCredential = generateTempPassword()
    return {
      passwordHash: await hashPassword(internalCredential),
      passwordExpiresAt: tempPasswordExpiry(),
    }
  }

  function buildInvitation({ userId, passwordHash, passwordExpiresAt, req }) {
    const token = createStaffInvitationToken({
      userId,
      credentialHash: passwordHash,
      expiresAt: passwordExpiresAt,
      secret: (env ?? process.env).AUTH_SECRET,
    })
    const configuredUrl = resolveDeploymentAppUrl(env ?? process.env)
    const requestOrigin = req?.get?.('origin') ?? ''
    const appUrl = configuredUrl || (/^https?:\/\//i.test(requestOrigin) ? requestOrigin : '')

    return {
      invitationUrl: buildStaffInvitationUrl(appUrl, token),
      idempotencyKey: `email:staff-invitation:${userId}:${staffInvitationFingerprint(token)}`,
    }
  }

  // Sólo se devuelve cuando el panel lo pide (`returnLink`) y el request ya
  // pasó el guard de escritura de usuarios: el enlace es una credencial de un
  // solo uso y vence con la invitación.
  function invitationLinkPayload(invitation, expiresAt) {
    return {
      invitationUrl: invitation.invitationUrl,
      invitationExpiresAt: expiresAt.toISOString(),
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
      // Los eventos asignados viajan solo para cuentas de rol por evento: una consulta
      // para todas, y ninguna si no hay organizadores.
      const organizerIds = users
        .filter((user) => isEventScopedRole(user.accessRole ?? user.accessRole?.key ?? user.role))
        .map((user) => user.id)
      if (organizerIds.length > 0 && typeof prismaClient.userEventAccess?.findMany === 'function') {
        const grants = await prismaClient.userEventAccess.findMany({
          where: { userId: { in: organizerIds } },
          select: { userId: true, eventId: true, eventSlug: true },
        })
        for (const user of users) {
          user.eventAccess = grants.filter((grant) => grant.userId === user.id)
        }
      }
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
        const { name, role: roleKey, sendEmail, returnLink, eventIds } = req.validatedBody

        // Sin email es una invitación abierta: la cuenta nace con un email
        // reservado y la persona completa el suyo al abrir el enlace.
        const email = req.validatedBody.email ?? buildPendingInviteEmail(randomUUID())
        const existing = await prismaClient.user.findUnique({ where: { email } })
        if (existing) throw new HttpError(409, 'Ya existe un usuario con ese email.')

        // Super Admin ya no queda reservado al seed: resolveAssignableRole
        // decide por jerarquía (sólo otro Super Admin puede crearlo).
        const accessRole = await resolveAssignableRole(prismaClient, req.auth.user, roleKey)
        if (accessRole.key === 'seguridad_plu_arg') {
          throw new HttpError(400, 'Las cuentas de Seguridad se crean desde un evento.')
        }

        const { firstName, lastName } = splitName(name ?? PENDING_INVITE_NAME)
        const { passwordHash, passwordExpiresAt } = await issueInvitationCredential()
        const created = await prismaClient.user.create({
          data: {
            email,
            passwordHash,
            mustChangePassword: true,
            passwordExpiresAt,
            role: accessRole.baseRole,
            ...(prismaClient.accessRole ? { accessRole: { connect: { id: accessRole.id } } } : {}),
            status: 'invited',
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

        let eventAccess = []
        if (isEventScopedRole(accessRole)) {
          eventAccess = await replaceUserEventAccess(prismaClient, getSupabaseAdmin, {
            userId: created.id,
            eventIds,
            actorId: req.auth.user.id,
          })
        }

        await recordIdentity(
          {
            action: 'account.created',
            entityType: 'staff_user',
            entityId: created.id,
            actorType: 'staff',
            actorId: req.auth.user.id,
            status: 'succeeded',
            severity: 'success',
            metadata: {
              accountKind: 'staff',
              channel: 'invitation',
              openInvite: isPendingInviteEmail(email),
              roleKey: accessRole.key,
              eventCount: eventAccess.length,
            },
          },
          req,
        )

        const user = {
          ...serializeUser(created.accessRole?.key ? created : { ...created, accessRole }),
          ...(isEventScopedRole(accessRole) ? { eventAccess } : {}),
        }
        const invitation = buildInvitation({
          userId: created.id,
          passwordHash,
          passwordExpiresAt,
          req,
        })
        const emailed = sendEmail
          ? await dispatchInvitation({
              user,
              invitationUrl: invitation.invitationUrl,
              idempotencyKey: invitation.idempotencyKey,
              roleName: accessRole.name,
              expiresInDays: TEMP_PASSWORD_TTL_DAYS,
            })
          : false

        res.status(201).json({
          user,
          emailed,
          ...(returnLink ? invitationLinkPayload(invitation, passwordExpiresAt) : {}),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  // ── Eventos de una cuenta de rol por evento (organizador) ───────────────────
  // Solo Super Admin y Administrador (`admin.users.write`): quién gestiona qué evento
  // es una decisión de PLU, no del organizador. Los cambios valen al instante sin
  // cerrarle la sesión: se purga su caché y el próximo request relee la lista.
  const eventAccessSchema = z.object({ eventIds: z.array(z.string().uuid()).max(50) })

  async function loadOrganizer(prismaClient, userId) {
    const target = await prismaClient.user.findUnique({
      where: { id: userId },
      include: userInclude(),
    })
    if (!target) throw new HttpError(404, 'El usuario no existe.')
    if (!isEventScopedRole(target.accessRole ?? target.accessRole?.key ?? target.role)) {
      throw new HttpError(400, 'Solo las cuentas con rol Organizador tienen eventos asignados.')
    }
    return target
  }

  const readEventAccess = (prismaClient, userId) =>
    prismaClient.userEventAccess.findMany({
      where: { userId },
      select: { eventId: true, eventSlug: true },
    })

  router.get('/:userId/event-access', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const prismaClient = getPrisma()
      const target = await loadOrganizer(prismaClient, req.params.userId)
      res.json({ eventAccess: await readEventAccess(prismaClient, target.id) })
    } catch (error) {
      next(error)
    }
  })

  router.put(
    '/:userId/event-access',
    ...writeGuard,
    staffLimiter,
    validateBody(eventAccessSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        const target = await loadOrganizer(prismaClient, req.params.userId)
        const after = await replaceUserEventAccess(prismaClient, getSupabaseAdmin, {
          userId: target.id,
          eventIds: req.validatedBody.eventIds,
          actorId: req.auth.user.id,
        })
        staffSessionCache.invalidateOwner(target.id)
        res.json({ eventAccess: after })
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

        const user = await applyRoleChange(prismaClient, getSupabaseAdmin, {
          actorId: req.auth.user.id,
          target,
          accessRole,
          eventIds: req.validatedBody.eventIds,
        })

        res.json({ user })
      } catch (error) {
        next(error)
      }
    },
  )

  // Cambio de rol de varias cuentas a la vez. Las reglas son las del individual
  // (sin tocar la propia cuenta ni al Super Admin, sólo roles asignables por
  // quien pide, Seguridad sólo desde su evento); lo que se valida una vez para
  // todo el pedido (el rol) corta el request entero, y lo que depende de cada
  // cuenta se reporta por cuenta sin frenar a las demás.
  // Organizador queda fuera del lote: cada cuenta necesita sus propios eventos.
  router.post(
    '/bulk-role',
    ...writeGuard,
    staffLimiter,
    validateBody(bulkUserAccessRoleSchema),
    async (req, res, next) => {
      try {
        const prismaClient = getPrisma()
        const { userIds, roleKey } = req.validatedBody

        const accessRole = await resolveAssignableRole(prismaClient, req.auth.user, roleKey)
        if (accessRole.key === 'seguridad_plu_arg') {
          throw new HttpError(400, 'Asigná Seguridad desde el evento correspondiente.')
        }
        if (isEventScopedRole(accessRole)) {
          throw new HttpError(400, 'El rol Organizador se asigna de a una cuenta, con sus eventos.')
        }

        const results = []
        for (const userId of userIds) {
          try {
            if (userId === req.auth.user.id) {
              throw new HttpError(400, 'No podés cambiar tu propio rol.')
            }
            const target = await prismaClient.user.findUnique({
              where: { id: userId },
              include: userInclude(),
            })
            if (!target) throw new HttpError(404, 'El usuario no existe.')
            if (target.role === 'admin_maximal') {
              throw new HttpError(403, 'El rol del Super Admin no se modifica desde el panel.')
            }
            if (!STAFF_LIST_ROLES.includes(target.role)) {
              throw new HttpError(400, 'Esa cuenta no se administra desde Usuarios.')
            }

            // Ya lo tiene: no hay nada que auditar ni motivo para cortarle la sesión.
            if ((target.accessRole?.key ?? target.role) === accessRole.key) {
              results.push({ userId, status: 'unchanged', user: serializeUser(target) })
              continue
            }

            const user = await applyRoleChange(prismaClient, getSupabaseAdmin, {
              actorId: req.auth.user.id,
              target,
              accessRole,
            })
            results.push({ userId, status: 'updated', user })
          } catch (error) {
            results.push({
              userId,
              status: 'failed',
              // Un error que no es nuestro (la base) no se le muestra al operador.
              error:
                error instanceof HttpError ? error.message : 'No se pudo cambiar el rol.',
            })
          }
        }

        res.json({ results })
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

  // Reenvío de invitación / reseteo de credencial. Rota la credencial interna,
  // vuelve a exigir la activación y corta las sesiones abiertas. La persona
  // recibe un enlace nuevo; el anterior queda inválido por versión.
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

        const { passwordHash, passwordExpiresAt } = await issueInvitationCredential()
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
        const invitation = buildInvitation({
          userId: updated.id,
          passwordHash,
          passwordExpiresAt,
          req,
        })
        const emailed = req.validatedBody.sendEmail
          ? await dispatchInvitation({
              user,
              invitationUrl: invitation.invitationUrl,
              idempotencyKey: invitation.idempotencyKey,
              roleName: updated.accessRole?.name ?? null,
              expiresInDays: TEMP_PASSWORD_TTL_DAYS,
            })
          : false

        res.json({
          user,
          emailed,
          ...(req.validatedBody.returnLink
            ? invitationLinkPayload(invitation, passwordExpiresAt)
            : {}),
        })
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
