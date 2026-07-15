import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { loginSchema } from '../../src/lib/schemas/auth.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { resolveOAuthUser, serializeOAuthUser } from '../services/oauthUserService.js'
import { verifyPassword } from '../services/passwordService.js'
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

const invalidCredentials = () => new HttpError(401, 'Credenciales invalidas.')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Proba de nuevo en unos minutos.' },
})

export function createAuthRoutes({ getPrisma, auth0JwtCheck }) {
  const router = Router()

  router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const { email, password } = req.validatedBody
      const user = await prisma.user.findUnique({
        where: { email },
        include: { profile: true },
      })

      if (
        !user ||
        user.status !== 'active' ||
        !(await verifyPassword(password, user.passwordHash))
      ) {
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

  router.post('/oauth/session', auth0JwtCheck, async (req, res, next) => {
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

  return router
}
