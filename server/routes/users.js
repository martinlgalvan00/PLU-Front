import { Router } from 'express'
import { createStaffUserSchema } from '../../src/lib/schemas/auth.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { serializeUser } from '../services/sessionService.js'

const MANAGE_USERS_ROLES = ['admin_maximal', 'admin_plu_arg']

// Roles que se muestran en la lista de staff del panel. athlete_plu queda
// afuera (son cuentas de atleta, no de administración) y seguridad_plu_arg
// también: esas se administran por evento desde /api/auth/security-users.
const STAFF_LIST_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'viewer_plu_usa']

function splitName(name) {
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') || firstName }
}

export function createUserRoutes({ getPrisma }) {
  const router = Router()
  const guard = requireRole(MANAGE_USERS_ROLES, { prisma: getPrisma() })

  router.get('/', ...guard, staffLimiter, async (_req, res, next) => {
    try {
      const prisma = getPrisma()
      const users = await prisma.user.findMany({
        where: { role: { in: STAFF_LIST_ROLES } },
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      })
      res.json({ users: users.map(serializeUser) })
    } catch (error) {
      next(error)
    }
  })

  // Alta de una cuenta de staff por invitación Auth0: se crea sin contraseña
  // (passwordHash null -> no puede entrar por /login) y con status 'active'
  // para que resolveOAuthUser la habilite y vincule la identidad Auth0 por
  // email en el primer ingreso. El rol admin_maximal no es creable acá
  // (queda reservado al seed) porque createStaffUserSchema no lo admite.
  router.post('/', ...guard, staffLimiter, validateBody(createStaffUserSchema), async (req, res, next) => {
    try {
      const prisma = getPrisma()
      const { name, email, role } = req.validatedBody

      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) throw new HttpError(409, 'Ya existe un usuario con ese email.')

      const { firstName, lastName } = splitName(name)
      const created = await prisma.user.create({
        data: {
          email,
          role,
          status: 'active',
          profile: {
            create: { firstName, lastName, displayName: `${firstName} ${lastName}`.trim() },
          },
        },
        include: { profile: true },
      })

      res.status(201).json({ user: serializeUser(created) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
