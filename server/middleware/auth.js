import { HttpError } from '../lib/errors.js'
import { readSessionFromRequest } from '../services/sessionService.js'

export function requireAuth({ prisma }) {
  return async (req, _res, next) => {
    try {
      const result = await readSessionFromRequest({ prisma, req })
      if (!result) {
        next(new HttpError(401, 'No autenticado.'))
        return
      }

      req.auth = result
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireRole(allowedRoles, deps) {
  const roles = new Set(allowedRoles)
  const auth = requireAuth(deps)

  return [
    auth,
    (req, _res, next) => {
      if (!roles.has(req.auth.user.role)) {
        next(new HttpError(403, 'No tenes permisos para esta accion.'))
        return
      }

      next()
    },
  ]
}

export function requireOrganizationRole(allowedRoles, deps, options = {}) {
  const auth = requireAuth(deps)
  const organizationIdParam = options.organizationIdParam ?? 'organizationId'

  return [
    auth,
    async (req, _res, next) => {
      try {
        const organizationId = req.params?.[organizationIdParam]
        if (!organizationId) {
          next(new HttpError(400, 'Falta organizationId.'))
          return
        }

        const membership = await deps.prisma.organizationMember.findFirst({
          where: {
            organizationId,
            userId: req.auth.user.id,
            status: 'active',
            role: { in: allowedRoles },
          },
          select: { role: true },
        })

        if (!membership) {
          next(new HttpError(403, 'No tenes permisos para esta organizacion.'))
          return
        }

        req.organizationRole = {
          organizationId,
          role: membership.role,
        }
        next()
      } catch (error) {
        next(error)
      }
    },
  ]
}
