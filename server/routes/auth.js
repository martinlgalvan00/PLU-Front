import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { createSecurityUserSchema, loginSchema, updateSecurityUserStatusSchema } from '../../src/lib/schemas/auth.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import { authLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { resolveOAuthUser, serializeOAuthUser } from '../services/oauthUserService.js'
import { hashPassword, verifyPassword } from '../services/passwordService.js'
import { ensureSupabaseSessionToken } from '../services/supabaseAuthBridge.js'
import {
  createSession,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  readSessionFromRequest,
  revokeSession,
  serializeUser,
  SESSION_COOKIE_NAME,
} from '../services/sessionService.js'

const MANAGE_USERS_ROLES = ['admin_maximal', 'admin_plu_arg']

const invalidCredentials = () => new HttpError(401, 'Credenciales invalidas.')

function generateTempPassword() {
  return randomBytes(9).toString('base64url')
}

function splitName(name) {
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') || firstName }
}

export function createAuthRoutes({ getPrisma, auth0JwtCheck }) {
  const router = Router()
  const manageUsersGuard = requireRole(MANAGE_USERS_ROLES, { prisma: getPrisma() })

  router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const { email, password, eventSlug } = req.validatedBody
      const user = await prisma.user.findUnique({
        where: { email },
        include: { profile: true, event: true },
      })

      if (
        !user ||
        user.status !== 'active' ||
        !(await verifyPassword(password, user.passwordHash))
      ) {
        next(invalidCredentials())
        return
      }

      // Solo las cuentas seguridad_plu_arg atadas a un evento (User.eventId,
      // creadas via POST /security-users) exigen eventSlug matching -- las
      // cuentas de seguridad sin evento asignado siguen entrando por el login
      // general, igual que antes de este scoping.
      if (user.role === 'seguridad_plu_arg' && user.eventId && user.event?.slug !== eventSlug) {
        next(invalidCredentials())
        return
      }

      const session = await createSession({ prisma, userId: user.id, req })

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })

      const serialized = serializeUser(user)
      const supabaseAuth = await ensureSupabaseSessionToken({ email: serialized.email, role: serialized.role })

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
      const supabaseAuth = await ensureSupabaseSessionToken({ email: serialized.email, role: serialized.role })

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
        const { name, email, eventId } = req.validatedBody

        const event = await prisma.event.findUnique({ where: { id: eventId } })
        if (!event) throw new HttpError(400, 'El evento no existe.')

        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) throw new HttpError(409, 'Ya existe un usuario con ese email.')

        const tempPassword = generateTempPassword()
        const passwordHash = await hashPassword(tempPassword)
        const { firstName, lastName } = splitName(name)

        const created = await prisma.user.create({
          data: {
            email,
            passwordHash,
            role: 'seguridad_plu_arg',
            status: 'active',
            eventId,
            profile: { create: { firstName, lastName } },
          },
          include: { profile: true, event: true },
        })

        res.status(201).json({ user: serializeUser(created), tempPassword })
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
        include: { profile: true, event: true },
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
          include: { profile: true, event: true },
        })

        res.json({ user: serializeUser(updated) })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
