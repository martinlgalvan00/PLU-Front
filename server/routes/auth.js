import { createHash } from 'node:crypto'
import { Router } from 'express'
import {
  acceptStaffInvitationSchema,
  changeOwnPasswordSchema,
  confirmEmailChangeSchema,
  createSecurityAccessLinkSchema,
  createSecurityUserSchema,
  createSecurityUsersBulkSchema,
  deactivateAllSecurityUsersSchema,
  loginSchema,
  requestEmailChangeSchema,
  securityGateSchema,
  updateSecurityUserStatusSchema,
} from '../../src/lib/schemas/auth.js'
import { buildSecurityGatePath } from '../../src/lib/securityGateRoute.js'
import { HttpError } from '../lib/errors.js'
import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createSecurityAccessNotificationService } from '../modules/notifications/securityAccessNotificationService.js'
import { createStaffAccountNotificationService } from '../modules/notifications/staffAccountNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  anonymousIdentityId,
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../modules/audit/operationalAuditWriter.js'
import { createAccessToken, verifyAccessToken } from '../services/securityAccessToken.js'
import {
  createStaffEmailChangeToken,
  verifyStaffEmailChangeToken,
} from '../services/staffEmailChangeToken.js'
import {
  readStaffInvitationSubject,
  verifyStaffInvitationToken,
} from '../services/staffInvitationToken.js'
import { fetchSupabaseEvent, requireSupabaseEvent } from '../services/securityEventService.js'
import { validateBody } from '../lib/validate.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'
import { authLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { resolveOAuthUser, serializeOAuthUser } from '../services/oauthUserService.js'
import {
  generateTempPassword,
  hashPassword,
  isTempPasswordExpired,
  verifyPassword,
} from '../services/passwordService.js'
import { ensureSupabaseSessionToken } from '../services/supabaseAuthBridge.js'
import { ACCESS_ROLE_INCLUDE } from '../services/accessControlService.js'
import {
  createSession,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  readSessionFromRequest,
  revokeSession,
  revokeSessionsForUser,
  serializeUser,
  SESSION_COOKIE_NAME,
} from '../services/sessionService.js'

// Vigencia de una credencial de acceso de puerta. Si el evento tiene fin
// conocido, la credencial dura hasta 7 días después (margen operativo);
// si no, un default de 30 días.
const ACCESS_LINK_POST_EVENT_MS = 1000 * 60 * 60 * 24 * 7
const ACCESS_LINK_DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30

const invalidCredentials = () => new HttpError(401, 'Credenciales invalidas.')

function resolveAccessLinkExpiry(event, now = new Date()) {
  const eventEnd = event?.endsAt ? new Date(event.endsAt) : null
  if (eventEnd && !Number.isNaN(eventEnd.getTime()) && eventEnd > now) {
    return new Date(eventEnd.getTime() + ACCESS_LINK_POST_EVENT_MS)
  }
  return new Date(now.getTime() + ACCESS_LINK_DEFAULT_TTL_MS)
}

function splitName(name) {
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') || firstName }
}

export function createAuthRoutes({
  getPrisma,
  getSupabaseAdmin,
  auth0JwtCheck,
  brevo,
  notificationRepository,
  env,
} = {}) {
  const router = Router()
  const manageUsersGuard = requirePermission('admin.users.write', { prisma: getPrisma() })

  function auditClient() {
    try {
      return getSupabaseAdmin?.() ?? null
    } catch {
      return null
    }
  }

  function recordIdentity(event, req) {
    return recordOperationalAuditEvent(auditClient(), {
      source: 'identity',
      ...event,
      metadata: requestAuditMetadata(req, event.metadata),
    })
  }

  function recordFailedLogin(req, email, reason, method = 'password') {
    return recordIdentity({
      action: 'auth.login_failed',
      entityType: 'staff_user',
      entityId: anonymousIdentityId('email', email),
      actorType: 'anonymous',
      status: 'failed',
      severity: 'warning',
      metadata: { method, reason },
    }, req)
  }

  // Los eventos viven en Supabase (public.events, id uuid). El panel entrega
  // ese uuid como eventId al dar de alta seguridad, asi que la validacion y
  // los datos del evento (slug/title/endsAt para credenciales y scoping)
  // salen de Supabase, no de la tabla Prisma Event (legacy, sin poblar). La
  // resolucion vive en securityEventService (compartida con el job de ciclo
  // de vida); aca solo inyectamos el cliente admin.
  const resolveEvent = (eventId) => requireSupabaseEvent(getSupabaseAdmin?.(), eventId)

  // Rechaza dar de alta seguridad para un evento que ya termino: esas cuentas
  // no podrian operar y el job de ciclo de vida las purgaria de inmediato.
  function assertEventOpen(event) {
    if (event.endsAt && new Date(event.endsAt).getTime() < Date.now()) {
      throw new HttpError(400, 'El evento ya finalizo.')
    }
  }
  // `brevo` y `notificationRepository` solo se inyectan desde los tests. En
  // producción llegaban undefined, con lo cual el aviso de acceso caía al
  // camino en memoria: no se enviaba ni quedaba registrado, y el alta se
  // apoyaba silenciosamente en mostrar las credenciales en pantalla. Se
  // construyen acá cuando no vienen dados. Sin Supabase se sigue sin
  // repositorio (modo degradado) en vez de romper el armado de la app.
  function resolveNotificationRepository() {
    if (notificationRepository) return notificationRepository
    try {
      const client = getSupabaseAdmin?.()
      return client ? createSupabaseNotificationRepository(client) : null
    } catch {
      return null
    }
  }

  const notifySecurityAccess = createSecurityAccessNotificationService({
    repository: resolveNotificationRepository(),
    brevo: brevo ?? createBrevoAdapter({ env: env ?? process.env }),
    env: env ?? process.env,
  })
  const staffNotifications = createStaffAccountNotificationService({
    repository: resolveNotificationRepository(),
    brevo: brevo ?? createBrevoAdapter({ env: env ?? process.env }),
    env: env ?? process.env,
  })
  const configuredAppUrl = (
    resolveDeploymentAppUrl(env ?? process.env) ||
    env?.VITE_APP_URL ||
    process.env.VITE_APP_URL ||
    ''
  ).replace(/\/$/, '')
  const accessLinkSecret = env?.AUTH_SECRET ?? process.env.AUTH_SECRET

  function resolveAppUrl(req) {
    if (configuredAppUrl) return configuredAppUrl
    const origin = req?.get?.('origin') ?? ''
    return /^https?:\/\//i.test(origin) ? origin.replace(/\/$/, '') : ''
  }

  function createPersonalAccess(user, event, req) {
    const expiresAt = resolveAccessLinkExpiry(event)
    const token = createAccessToken({
      userId: user.id,
      eventId: user.eventId,
      expiresAt,
      secret: accessLinkSecret,
    })
    const url = `${resolveAppUrl(req)}${buildSecurityGatePath(user.eventSlug)}?acceso=${token}`

    return { url, token, expiresAt }
  }

  // Crea una cuenta seguridad_plu_arg con password temporal. Compartido por
  // el alta individual y la masiva -- el caller ya validó que el evento
  // existe y (para el alta individual) que el email no está tomado.
  async function requireSecurityAccessRole(prisma) {
    const role = await prisma.accessRole.findUnique({
      where: { key: 'seguridad_plu_arg' },
      select: { key: true, active: true },
    })
    if (!role?.active) {
      throw new HttpError(
        503,
        'El rol de Seguridad no está inicializado. Ejecutá las migraciones y el seed.',
      )
    }
  }

  function canReuseSecurityUser(user, eventId) {
    return user?.role === 'seguridad_plu_arg' && (!user.eventId || user.eventId === eventId)
  }

  async function provisionSecurityUser(prisma, { name, email, event, existing = null }) {
    const { firstName, lastName } = splitName(name)

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          eventId: event.id,
          eventSlug: event.slug,
          accessRole: { connect: { key: 'seguridad_plu_arg' } },
          profile: {
            upsert: {
              create: { firstName, lastName },
              update: { firstName, lastName },
            },
          },
        },
        include: { profile: true },
      })
      return { user: serializeUser(updated), tempPassword: null, event, reused: true }
    }

    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'seguridad_plu_arg',
        accessRole: { connect: { key: 'seguridad_plu_arg' } },
        status: 'active',
        eventId: event.id,
        eventSlug: event.slug,
        profile: { create: { firstName, lastName } },
      },
      include: { profile: true },
    })

    return { user: serializeUser(created), tempPassword, event, reused: false }
  }

  // Envío best-effort de credenciales: nunca corta el flujo de alta. Devuelve
  // true solo si Brevo confirmó el envío (status 'sent'); si no está
  // configurado o falla, el caller igual muestra las credenciales en pantalla.
  async function dispatchAccessEmail(payload) {
    try {
      const result = await notifySecurityAccess(payload)
      // El dispatcher expone el estado arriba de todo; `emailLog` es null
      // cuando se corre sin repositorio.
      return result?.status === 'sent' || result?.emailLog?.status === 'sent'
    } catch {
      return false
    }
  }

  router.post(
    '/accept-staff-invitation',
    authLimiter,
    validateBody(acceptStaffInvitationSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const { token, password } = req.validatedBody
        const userId = readStaffInvitationSubject(token)
        const user = userId
          ? await prisma.user.findUnique({
              where: { id: userId },
              include: { profile: true, accessRole: { include: ACCESS_ROLE_INCLUDE } },
            })
          : null
        const payload = user
          ? verifyStaffInvitationToken(token, {
              credentialHash: user.passwordHash,
              secret: accessLinkSecret,
            })
          : null
        const canAccept =
          payload?.uid === user?.id &&
          user.mustChangePassword === true &&
          ['active', 'invited'].includes(user.status) &&
          !isTempPasswordExpired(user)

        if (!canAccept) {
          await recordIdentity({
            action: 'auth.invitation_failed',
            entityType: 'staff_user',
            entityId: anonymousIdentityId('invitation', token),
            actorType: 'anonymous',
            status: 'failed',
            severity: 'warning',
            metadata: { reason: 'invalid_expired_or_used' },
          }, req)
          throw new HttpError(400, 'La invitación es inválida, ya fue utilizada o venció.', {
            code: 'staff_invitation_invalid',
          })
        }

        const now = new Date()
        await revokeSessionsForUser({ prisma, userId: user.id, now })
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash: await hashPassword(password),
            mustChangePassword: false,
            passwordExpiresAt: null,
            status: 'active',
            lastLoginAt: now,
          },
          include: { profile: true, accessRole: { include: ACCESS_ROLE_INCLUDE } },
        })
        const session = await createSession({ prisma, userId: user.id, req, now })
        const serialized = serializeUser(updated)
        const supabaseAuth = await ensureSupabaseSessionToken({
          admin: auditClient(),
          email: serialized.email,
          permissions: serialized.permissions,
          role: serialized.roleKey,
        })

        await recordIdentity({
          action: 'auth.invitation_accepted',
          entityType: 'staff_user',
          entityId: user.id,
          actorType: 'staff',
          actorId: user.id,
          status: 'succeeded',
          severity: 'success',
          metadata: { roleKey: serialized.roleKey },
        }, req)

        res
          .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
          .json({ user: serialized, supabaseAuth })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const { email, password, eventSlug } = req.validatedBody
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          profile: true,
          accessRole: { include: ACCESS_ROLE_INCLUDE },
        },
      })

      // La comparación se hace SIEMPRE, incluso sin usuario: si cortáramos por
      // short-circuit, un email inexistente respondería sin pagar el bcrypt y
      // el tiempo de respuesta revelaría qué cuentas existen.
      const passwordMatches = await verifyPassword(password, user?.passwordHash)

      if (!user || user.status !== 'active' || !passwordMatches) {
        await recordFailedLogin(req, email, 'invalid_credentials')
        next(invalidCredentials())
        return
      }

      // El aviso de vencimiento se da recién acá, con la contraseña ya
      // validada: quien lo ve es porque tenía la credencial correcta, así que
      // no revela la existencia de ninguna cuenta. Decirlo importa -- con el
      // 401 genérico la persona reintenta creyendo que se equivocó al copiar.
      if (isTempPasswordExpired(user)) {
        await recordFailedLogin(req, email, 'temporary_credential_expired')
        next(
          new HttpError(401, 'Tu invitación venció. Pedile al administrador que te la reenvíe.', {
            code: 'temp_password_expired',
          }),
        )
        return
      }

      // El alcance por evento pertenece a la cuenta, no al nombre del rol.
      // Esto también cubre futuros roles personalizados de operación.
      if (user.eventId && user.eventSlug !== eventSlug) {
        await recordFailedLogin(req, email, 'event_scope_mismatch')
        next(invalidCredentials())
        return
      }

      const session = await createSession({ prisma, userId: user.id, req })

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })

      const serialized = serializeUser(user)
      const supabaseAuth = await ensureSupabaseSessionToken({
        admin: auditClient(),
        email: serialized.email,
        permissions: serialized.permissions,
        role: serialized.roleKey,
      })

      await recordIdentity({
        action: 'auth.login_succeeded',
        entityType: 'staff_user',
        entityId: user.id,
        actorType: 'staff',
        actorId: user.id,
        status: 'succeeded',
        severity: 'success',
        metadata: { method: 'password', roleKey: serialized.roleKey },
      }, req)

      res
        .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
        .json({ user: serialized, supabaseAuth })
    } catch (error) {
      next(error)
    }
  })

  // Probe de bootstrap: sin sesión responde 200 + user null (no 401) para
  // no ensuciar la consola del navegador en cada visita anónima al login.
  router.get('/me', async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const result = await readSessionFromRequest({ prisma, req })
      res.json({ user: result?.user ?? null })
    } catch (error) {
      next(error)
    }
  })

  router.post('/oauth/session', authLimiter, auth0JwtCheck, async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const user = await resolveOAuthUser({ prisma, payload: req.auth?.payload })
      const session = await createSession({ prisma, userId: user.id, req })

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })

      const serialized = serializeOAuthUser(user)
      const supabaseAuth = await ensureSupabaseSessionToken({
        admin: auditClient(),
        email: serialized.email,
        permissions: serialized.permissions,
        role: serialized.roleKey,
      })

      await recordIdentity({
        action: 'auth.login_succeeded',
        entityType: 'staff_user',
        entityId: user.id,
        actorType: 'staff',
        actorId: user.id,
        status: 'succeeded',
        severity: 'success',
        metadata: { method: 'oauth', roleKey: serialized.roleKey },
      }, req)

      res
        .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
        .json({ user: serialized, supabaseAuth })
    } catch (error) {
      next(error)
    }
  })

  router.post('/logout', async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const token = req.cookies?.[SESSION_COOKIE_NAME]
      const current = await readSessionFromRequest({ prisma, req })
      await revokeSession({ prisma, token })
      if (current?.user?.id) {
        await recordIdentity({
          action: 'auth.session_ended',
          entityType: 'staff_user',
          entityId: current.user.id,
          actorType: 'staff',
          actorId: current.user.id,
          status: 'succeeded',
          severity: 'success',
          metadata: { reason: 'logout' },
        }, req)
      }
      res.clearCookie(SESSION_COOKIE_NAME, getClearSessionCookieOptions()).status(204).end()
    } catch (error) {
      next(error)
    }
  })

  // --------------------------------------------------------------- mi cuenta

  // Único endpoint alcanzable con una contraseña temporal: es la salida del
  // estado `mustChangePassword`, así que no puede quedar detrás del corte.
  router.post(
    '/me/password',
    requireAuth({ prisma: getPrisma(), allowPasswordChangePending: true }),
    authLimiter,
    validateBody(changeOwnPasswordSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const { currentPassword, password } = req.validatedBody
        const current = await prisma.user.findUnique({ where: { id: req.auth.user.id } })

        if (!(await verifyPassword(currentPassword, current?.passwordHash))) {
          next(new HttpError(400, 'La contraseña actual no coincide.'))
          return
        }

        await prisma.user.update({
          where: { id: current.id },
          data: {
            passwordHash: await hashPassword(password),
            mustChangePassword: false,
            // La contraseña elegida por el usuario no caduca.
            passwordExpiresAt: null,
          },
        })

        // Se cortan las demás sesiones (no la propia): si la temporal circuló
        // por mail, cambiarla tiene que expulsar a quien la haya usado.
        await revokeSessionsForUser({ prisma, userId: current.id })
        const session = await createSession({ prisma, userId: current.id, req })
        const refreshed = await prisma.user.findUnique({
          where: { id: current.id },
          include: { profile: true, accessRole: { include: ACCESS_ROLE_INCLUDE } },
        })

        res
          .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
          .json({ user: serializeUser(refreshed) })
      } catch (error) {
        next(error)
      }
    },
  )

  // Cambio de email en dos pasos. No se toca la cuenta acá: sólo se emite un
  // token firmado y se manda a la casilla nueva. Hasta que se confirme, el
  // usuario sigue entrando con la dirección vieja.
  router.post(
    '/me/email',
    requireAuth({ prisma: getPrisma() }),
    authLimiter,
    validateBody(requestEmailChangeSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const { email, currentPassword } = req.validatedBody
        const current = await prisma.user.findUnique({
          where: { id: req.auth.user.id },
          include: { profile: true },
        })

        // La sesión sola no alcanza para mover la identidad de login de una
        // cuenta con permisos de panel.
        if (!(await verifyPassword(currentPassword, current?.passwordHash))) {
          next(new HttpError(400, 'La contraseña actual no coincide.'))
          return
        }
        if (email === current.email) {
          next(new HttpError(400, 'Ese ya es el email de tu cuenta.'))
          return
        }

        const taken = await prisma.user.findUnique({ where: { email } })
        if (taken) {
          next(new HttpError(409, 'Ese email ya está en uso.'))
          return
        }

        const token = createStaffEmailChangeToken({
          userId: current.id,
          email,
          secret: accessLinkSecret,
        })

        let emailed = false
        try {
          const result = await staffNotifications.notifyStaffEmailChange({
            user: serializeUser(current),
            newEmail: email,
            token,
          })
          emailed = result?.status === 'sent' || result?.emailLog?.status === 'sent'
        } catch {
          emailed = false
        }

        res.json({ pendingEmail: email, emailed })
      } catch (error) {
        next(error)
      }
    },
  )

  // Confirmación del cambio. Es pública a propósito: el link se abre desde la
  // casilla nueva, que puede no ser el navegador donde está la sesión.
  router.post(
    '/verify-email-change',
    authLimiter,
    validateBody(confirmEmailChangeSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const payload = verifyStaffEmailChangeToken(req.validatedBody.token, {
          secret: accessLinkSecret,
        })
        if (!payload) {
          next(new HttpError(400, 'El enlace es inválido o venció.'))
          return
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.uid },
          include: { profile: true },
        })
        if (!user || user.status !== 'active') {
          next(new HttpError(400, 'El enlace es inválido o venció.'))
          return
        }
        // Idempotente: reabrir el link ya usado no es un error.
        if (user.email === payload.eml) {
          res.json({ email: user.email, alreadyApplied: true })
          return
        }

        // Se revalida acá y no sólo al pedirlo: entre el pedido y la
        // confirmación pueden haber pasado 24 h y otra alta pudo tomar la
        // dirección.
        const taken = await prisma.user.findUnique({ where: { email: payload.eml } })
        if (taken) {
          next(new HttpError(409, 'Ese email ya está en uso.'))
          return
        }

        const previousEmail = user.email
        await prisma.user.update({
          where: { id: user.id },
          data: { email: payload.eml },
        })

        if (prisma.auditLog?.create) {
          await prisma.auditLog.create({
            data: {
              action: 'user.email_changed',
              entityType: 'user',
              entityId: user.id,
              actorId: user.id,
              before: { email: previousEmail },
              after: { email: payload.eml },
            },
          })
        }

        // El email es la identidad de login: las sesiones abiertas se cortan
        // para que el próximo ingreso se haga con la dirección nueva.
        await revokeSessionsForUser({ prisma, userId: user.id })

        // Aviso a la casilla que se deja de usar: es el único canal que le
        // queda a alguien cuya sesión fue secuestrada para enterarse.
        try {
          await staffNotifications.notifyStaffEmailChanged({
            user: serializeUser(user),
            previousEmail,
            newEmail: payload.eml,
          })
        } catch {
          // Best-effort: el cambio ya se aplicó.
        }

        res.json({ email: payload.eml, alreadyApplied: false })
      } catch (error) {
        next(error)
      }
    },
  )

  // ------------------------------------------------------------- seguridad

  router.post(
    '/security-users',
    ...manageUsersGuard,
    staffLimiter,
    validateBody(createSecurityUserSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const { name, email, eventId, sendEmail } = req.validatedBody

        const event = await resolveEvent(eventId)
        assertEventOpen(event)
        await requireSecurityAccessRole(prisma)

        const existing = await prisma.user.findUnique({
          where: { email },
          include: { profile: true },
        })
        if (existing && !canReuseSecurityUser(existing, event.id)) {
          throw new HttpError(
            409,
            existing.role === 'seguridad_plu_arg'
              ? 'La cuenta de seguridad ya está asignada a otro evento.'
              : 'Ya existe un usuario con ese email.',
          )
        }

        const { user, tempPassword, reused } = await provisionSecurityUser(prisma, {
          name,
          email,
          event,
          existing,
        })
        await recordIdentity({
          action: reused ? 'account.reactivated' : 'account.created',
          entityType: 'staff_user',
          entityId: user.id,
          actorType: 'staff',
          actorId: req.auth.user.id,
          status: 'succeeded',
          severity: 'success',
          metadata: {
            accountKind: 'security',
            eventId: event.id,
            roleKey: 'seguridad_plu_arg',
          },
        }, req)
        const access = createPersonalAccess(user, event, req)
        const emailed = sendEmail
          ? await dispatchAccessEmail({ user, event, accessUrl: access.url })
          : false

        res.status(201).json({
          user,
          tempPassword,
          emailed,
          accessUrl: access.url,
          expiresAt: access.expiresAt.toISOString(),
          reused,
        })
      } catch (error) {
        next(error)
      }
    },
  )

  // Alta masiva -- pensada para cargar de una la lista de personal de puerta.
  // Partial success: los emails ya existentes (o los que choquen en una
  // carrera) se reportan en `skipped` sin frenar el resto del lote.
  router.post(
    '/security-users/bulk',
    ...manageUsersGuard,
    staffLimiter,
    validateBody(createSecurityUsersBulkSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const { eventId, users, sendEmail } = req.validatedBody

        const event = await resolveEvent(eventId)
        assertEventOpen(event)
        await requireSecurityAccessRole(prisma)

        // Una sola consulta para detectar emails ya tomados, en vez de un
        // findUnique por cada entrada del lote.
        const existingRows = await prisma.user.findMany({
          where: { email: { in: users.map((entry) => entry.email) } },
          include: { profile: true },
        })
        const existingByEmail = new Map(existingRows.map((row) => [row.email, row]))

        const toCreate = users
          .filter((entry) => {
            const existing = existingByEmail.get(entry.email)
            return !existing || canReuseSecurityUser(existing, event.id)
          })
          .map((entry) => ({ ...entry, existing: existingByEmail.get(entry.email) ?? null }))
        const skipped = users
          .filter((entry) => {
            const existing = existingByEmail.get(entry.email)
            return existing && !canReuseSecurityUser(existing, event.id)
          })
          .map((entry) => ({
            email: entry.email,
            reason:
              existingByEmail.get(entry.email)?.role === 'seguridad_plu_arg'
                ? 'other_event'
                : 'exists',
          }))

        // Altas en paralelo, cada una independiente (partial success).
        const settled = await Promise.allSettled(
          toCreate.map((entry) => provisionSecurityUser(prisma, { ...entry, event })),
        )

        const created = []
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const access = createPersonalAccess(result.value.user, event, req)
            created.push({
              user: result.value.user,
              tempPassword: result.value.tempPassword,
              accessUrl: access.url,
              expiresAt: access.expiresAt.toISOString(),
              emailed: false,
              reused: result.value.reused,
            })
            return
          }
          const reason = result.reason?.code === 'P2002' ? 'exists' : 'error'
          skipped.push({ email: toCreate[index].email, reason })
        })

        // Envío de credenciales best-effort, en paralelo, recién después de
        // crear todas las cuentas.
        await Promise.all(
          created.map((item) => recordIdentity({
            action: item.reused ? 'account.reactivated' : 'account.created',
            entityType: 'staff_user',
            entityId: item.user.id,
            actorType: 'staff',
            actorId: req.auth.user.id,
            status: 'succeeded',
            severity: 'success',
            metadata: {
              accountKind: 'security',
              eventId: event.id,
              roleKey: 'seguridad_plu_arg',
              bulk: true,
            },
          }, req)),
        )

        if (sendEmail && created.length) {
          const emailResults = await Promise.allSettled(
            created.map((item) =>
              dispatchAccessEmail({ user: item.user, event, accessUrl: item.accessUrl }),
            ),
          )
          emailResults.forEach((result, index) => {
            created[index].emailed = result.status === 'fulfilled' && result.value === true
          })
        }

        res.status(201).json({ created, skipped })
      } catch (error) {
        next(error)
      }
    },
  )

  // Baja masiva -- al terminar el evento, corta el acceso de todas las
  // cuentas de seguridad de ese evento en una sola query. Al pasar a
  // 'disabled', readSession corta la sesión activa en el próximo request.
  router.post(
    '/security-users/deactivate-all',
    ...manageUsersGuard,
    staffLimiter,
    validateBody(deactivateAllSecurityUsersSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const result = await prisma.user.updateMany({
          where: {
            role: 'seguridad_plu_arg',
            eventId: req.validatedBody.eventId,
            status: 'active',
          },
          data: { status: 'disabled' },
        })

        res.json({ deactivated: result.count })
      } catch (error) {
        next(error)
      }
    },
  )

  // Cuentas seguridad_plu_arg de un evento puntual -- se listan por evento
  // (no hay una vista "todos los usuarios de seguridad de todos los
  // eventos" todavia) para que el admin vea, dentro del editor de ese
  // evento, a quien le dio acceso.
  router.get('/security-users', ...manageUsersGuard, staffLimiter, async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const eventId = String(req.query.eventId ?? '')
      if (!eventId) throw new HttpError(400, 'Falta eventId.')

      const users = await prisma.user.findMany({
        where: { role: 'seguridad_plu_arg', eventId },
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      })

      res.json({ users: users.map(serializeUser) })
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/security-users/:userId/status',
    ...manageUsersGuard,
    staffLimiter,
    validateBody(updateSecurityUserStatusSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const target = await prisma.user.findUnique({ where: { id: req.params.userId } })
        if (!target || target.role !== 'seguridad_plu_arg') {
          throw new HttpError(404, 'Usuario de seguridad no encontrado.')
        }

        // status pasa a 'disabled' -> readSession corta la sesion activa en
        // el proximo request (chequea user.status === 'active'), sin tener
        // que revocar tokens uno por uno.
        const updated = await prisma.user.update({
          where: { id: target.id },
          data: { status: req.validatedBody.status },
          include: { profile: true },
        })

        res.json({ user: serializeUser(updated) })
      } catch (error) {
        next(error)
      }
    },
  )

  // Genera una credencial de acceso: un link (con token firmado) que deja
  // entrar a la puerta sin contraseña. Se puede copiar/QR o mandar por mail.
  router.post(
    '/security-users/:userId/access-link',
    ...manageUsersGuard,
    staffLimiter,
    validateBody(createSecurityAccessLinkSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const user = await prisma.user.findUnique({
          where: { id: req.params.userId },
          include: { profile: true },
        })
        if (!user || user.role !== 'seguridad_plu_arg') {
          throw new HttpError(404, 'Usuario de seguridad no encontrado.')
        }
        if (!user.eventId || !user.eventSlug) {
          throw new HttpError(400, 'La cuenta no tiene un evento asignado.')
        }

        // El slug ya lo tenemos desnormalizado en la cuenta; endsAt (para la
        // vigencia de la credencial) sale de Supabase. Si el evento ya no
        // existe alla, se cae al TTL default de resolveAccessLinkExpiry.
        const event = (await fetchSupabaseEvent(getSupabaseAdmin?.(), user.eventId)) ?? {
          slug: user.eventSlug,
        }
        const access = createPersonalAccess(serializeUser(user), event, req)

        const emailed = req.validatedBody.sendEmail
          ? await dispatchAccessEmail({
              user: serializeUser(user),
              event,
              accessUrl: access.url,
              idempotencyKey: `email:security-access-link:${user.id}:${createHash('sha256').update(access.token).digest('hex').slice(0, 24)}`,
            })
          : false

        res.json({
          url: access.url,
          token: access.token,
          expiresAt: access.expiresAt.toISOString(),
          emailed,
        })
      } catch (error) {
        next(error)
      }
    },
  )

  // Login por credencial de acceso (passwordless). El token firmado prueba
  // la identidad; igual revalidamos contra la DB (status activo + evento
  // asignado) para que dar de baja la cuenta invalide la credencial al toque.
  router.post(
    '/security-gate',
    authLimiter,
    validateBody(securityGateSchema),
    async (req, res, next) => {
      try {
        const prisma = getPrisma()
        const payload = verifyAccessToken(req.validatedBody.token, { secret: accessLinkSecret })
        if (!payload) {
          await recordIdentity({
            action: 'auth.login_failed',
            entityType: 'staff_user',
            entityId: anonymousIdentityId('access_token', req.validatedBody.token),
            actorType: 'anonymous',
            status: 'failed',
            severity: 'warning',
            metadata: { method: 'security_gate', reason: 'invalid_or_expired_token' },
          }, req)
          next(new HttpError(401, 'Credencial inválida o vencida.'))
          return
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.uid },
          include: { profile: true },
        })
        if (
          !user ||
          user.role !== 'seguridad_plu_arg' ||
          user.status !== 'active' ||
          user.eventId !== payload.eid
        ) {
          await recordIdentity({
            action: 'auth.login_failed',
            entityType: 'staff_user',
            entityId: payload.uid,
            actorType: 'anonymous',
            status: 'failed',
            severity: 'warning',
            metadata: { method: 'security_gate', reason: 'account_or_scope_mismatch' },
          }, req)
          next(new HttpError(401, 'Credencial inválida o vencida.'))
          return
        }

        const session = await createSession({ prisma, userId: user.id, req })
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

        const serialized = serializeUser(user)
        const supabaseAuth = await ensureSupabaseSessionToken({
          admin: auditClient(),
          email: serialized.email,
          permissions: serialized.permissions,
          role: serialized.roleKey,
        })

        await recordIdentity({
          action: 'auth.login_succeeded',
          entityType: 'staff_user',
          entityId: user.id,
          actorType: 'staff',
          actorId: user.id,
          status: 'succeeded',
          severity: 'success',
          metadata: { method: 'security_gate', roleKey: serialized.roleKey, eventId: user.eventId },
        }, req)

        res
          .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
          .json({ user: serialized, supabaseAuth })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
