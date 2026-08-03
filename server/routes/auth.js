import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import {
  createSecurityAccessLinkSchema,
  createSecurityUserSchema,
  createSecurityUsersBulkSchema,
  deactivateAllSecurityUsersSchema,
  loginSchema,
  securityGateSchema,
  updateSecurityUserStatusSchema,
} from '../../src/lib/schemas/auth.js'
import { buildSecurityGatePath } from '../../src/lib/securityGateRoute.js'
import { HttpError } from '../lib/errors.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createSecurityAccessNotificationService } from '../modules/notifications/securityAccessNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { createAccessToken, verifyAccessToken } from '../services/securityAccessToken.js'
import { fetchSupabaseEvent } from '../services/securityEventService.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { authLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { resolveOAuthUser, serializeOAuthUser } from '../services/oauthUserService.js'
import { hashPassword, verifyPassword } from '../services/passwordService.js'
import { ensureSupabaseSessionToken } from '../services/supabaseAuthBridge.js'
import {
  ACCESS_ROLE_INCLUDE,
} from '../services/accessControlService.js'
import {
  createSession,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  readSessionFromRequest,
  revokeSession,
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

function generateTempPassword() {
  return randomBytes(9).toString('base64url')
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

  // Los eventos viven en Supabase (public.events, id uuid). El panel entrega
  // ese uuid como eventId al dar de alta seguridad, asi que la validacion y
  // los datos del evento (slug/title/endsAt para credenciales y scoping)
  // salen de Supabase, no de la tabla Prisma Event (legacy, sin poblar). La
  // resolucion vive en securityEventService (compartida con el job de ciclo
  // de vida); aca solo inyectamos el cliente admin.
  const resolveEvent = (eventId) => fetchSupabaseEvent(getSupabaseAdmin?.(), eventId)

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
  const accessLinkAppUrl = (env?.APP_URL ?? process.env.APP_URL ?? '').replace(/\/$/, '')
  const accessLinkSecret = env?.AUTH_SECRET ?? process.env.AUTH_SECRET

  function createPersonalAccess(user, event) {
    const expiresAt = resolveAccessLinkExpiry(event)
    const token = createAccessToken({
      userId: user.id,
      eventId: user.eventId,
      expiresAt,
      secret: accessLinkSecret,
    })
    const url = `${accessLinkAppUrl}${buildSecurityGatePath(user.eventSlug)}?acceso=${token}`

    return { url, token, expiresAt }
  }

  // Crea una cuenta seguridad_plu_arg con password temporal. Compartido por
  // el alta individual y la masiva -- el caller ya validó que el evento
  // existe y (para el alta individual) que el email no está tomado.
  async function provisionSecurityUser(prisma, { name, email, event }) {
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)
    const { firstName, lastName } = splitName(name)

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

    return { user: serializeUser(created), tempPassword, event }
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
        next(invalidCredentials())
        return
      }

      // El alcance por evento pertenece a la cuenta, no al nombre del rol.
      // Esto también cubre futuros roles personalizados de operación.
      if (user.eventId && user.eventSlug !== eventSlug) {
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
        email: serialized.email,
        permissions: serialized.permissions,
        role: serialized.roleKey,
      })

      res
        .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
        .json({ user: serialized, supabaseAuth })
    } catch (error) {
      next(error)
    }
  })

  router.get('/me', async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const result = await readSessionFromRequest({ prisma, req })
      if (!result) {
        next(new HttpError(401, 'No autenticado.'))
        return
      }

      res.json({ user: result.user })
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
        email: serialized.email,
        permissions: serialized.permissions,
        role: serialized.roleKey,
      })

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
      await revokeSession({ prisma, token })
      res.clearCookie(SESSION_COOKIE_NAME, getClearSessionCookieOptions()).status(204).end()
    } catch (error) {
      next(error)
    }
  })

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
        if (!event) throw new HttpError(400, 'El evento no existe.')
        assertEventOpen(event)

        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) throw new HttpError(409, 'Ya existe un usuario con ese email.')

        const { user, tempPassword } = await provisionSecurityUser(prisma, { name, email, event })
        const access = createPersonalAccess(user, event)
        const emailed = sendEmail
          ? await dispatchAccessEmail({ user, event, accessUrl: access.url })
          : false

        res.status(201).json({
          user,
          tempPassword,
          emailed,
          accessUrl: access.url,
          expiresAt: access.expiresAt.toISOString(),
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
        if (!event) throw new HttpError(400, 'El evento no existe.')
        assertEventOpen(event)

        // Una sola consulta para detectar emails ya tomados, en vez de un
        // findUnique por cada entrada del lote.
        const existingRows = await prisma.user.findMany({
          where: { email: { in: users.map((entry) => entry.email) } },
          select: { email: true },
        })
        const existingEmails = new Set(existingRows.map((row) => row.email))

        const toCreate = users.filter((entry) => !existingEmails.has(entry.email))
        const skipped = users
          .filter((entry) => existingEmails.has(entry.email))
          .map((entry) => ({ email: entry.email, reason: 'exists' }))

        // Altas en paralelo, cada una independiente (partial success).
        const settled = await Promise.allSettled(
          toCreate.map((entry) => provisionSecurityUser(prisma, { ...entry, event })),
        )

        const created = []
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const access = createPersonalAccess(result.value.user, event)
            created.push({
              user: result.value.user,
              tempPassword: result.value.tempPassword,
              accessUrl: access.url,
              expiresAt: access.expiresAt.toISOString(),
              emailed: false,
            })
            return
          }
          const reason = result.reason?.code === 'P2002' ? 'exists' : 'error'
          skipped.push({ email: toCreate[index].email, reason })
        })

        // Envío de credenciales best-effort, en paralelo, recién después de
        // crear todas las cuentas.
        if (sendEmail && created.length) {
          const emailResults = await Promise.allSettled(
            created.map((item) => dispatchAccessEmail({ user: item.user, event, accessUrl: item.accessUrl })),
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
          where: { role: 'seguridad_plu_arg', eventId: req.validatedBody.eventId, status: 'active' },
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
        const event = (await resolveEvent(user.eventId)) ?? { slug: user.eventSlug }
        const access = createPersonalAccess(serializeUser(user), event)

        const emailed = req.validatedBody.sendEmail
          ? await dispatchAccessEmail({
              user: serializeUser(user),
              event,
              accessUrl: access.url,
              idempotencyKey: `email:security-access-link:${user.id}:${access.token.slice(-16)}`,
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
  router.post('/security-gate', authLimiter, validateBody(securityGateSchema), async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const payload = verifyAccessToken(req.validatedBody.token, { secret: accessLinkSecret })
      if (!payload) {
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
        next(new HttpError(401, 'Credencial inválida o vencida.'))
        return
      }

      const session = await createSession({ prisma, userId: user.id, req })
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

      const serialized = serializeUser(user)
      const supabaseAuth = await ensureSupabaseSessionToken({
        email: serialized.email,
        permissions: serialized.permissions,
        role: serialized.roleKey,
      })

      res
        .cookie(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions())
        .json({ user: serialized, supabaseAuth })
    } catch (error) {
      next(error)
    }
  })

  return router
}
