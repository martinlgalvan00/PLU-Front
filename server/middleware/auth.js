import { HttpError } from '../lib/errors.js'
import { hasAnyPermission, hasPermission } from '../../src/lib/permissions.js'
import { eventScopeOf } from '../lib/eventScope.js'
import { extendSessionIfActive, readSessionFromRequest } from '../services/sessionService.js'

/**
 * @param {{ prisma: unknown, allowPasswordChangePending?: boolean }} deps
 *
 * `allowPasswordChangePending` sólo lo activan las rutas que el usuario tiene
 * que poder alcanzar justamente para salir del estado (cambiar la contraseña
 * y cerrar sesión).
 *
 * `allowEventScoped` es el candado por defecto del rol "por evento" (organizador):
 * sin esta opción esa cuenta recibe 403 en la ruta, sea cual sea su permiso. Solo
 * las rutas que filtran por evento (ver `server/lib/eventScope.js`) o que son de
 * la propia cuenta (cambiar contraseña) la activan.
 */
export function requireAuth({
  prisma,
  allowPasswordChangePending = false,
  allowEventScoped = false,
}) {
  return async (req, res, next) => {
    try {
      const result = await readSessionFromRequest({ prisma, req })
      if (!result) {
        next(new HttpError(401, 'No autenticado.'))
        return
      }

      // Una contraseña temporal habilita a una sola cosa: cambiarla. Sin este
      // corte del lado del servidor sería una credencial completa y permanente
      // -- alcanzaría con no pasar por la pantalla del panel para operar con
      // ella, que es exactamente lo que un mail filtrado le da a un tercero.
      if (result.user.mustChangePassword && !allowPasswordChangePending) {
        next(
          new HttpError(403, 'Tenés que elegir una contraseña propia antes de seguir.', {
            code: 'password_change_required',
          }),
        )
        return
      }

      // Corta ANTES de mirar permisos: un organizador con `admin.events.write` no
      // puede por eso tocar una ruta global que nadie revisó para su alcance.
      if (result.user.eventScoped && !allowEventScoped) {
        next(
          new HttpError(403, 'Esta cuenta solo gestiona los eventos que se le asignaron.', {
            code: 'event_scope_denied',
          }),
        )
        return
      }

      req.auth = result
      req.eventScope = eventScopeOf(req)
      // Ventana deslizante: mientras el staff siga operando, la sesión no
      // vence a las 8 h del login. Best-effort y con tope absoluto (ver
      // `extendSessionIfActive`): un fallo acá no puede tumbar el request.
      try {
        await extendSessionIfActive({ prisma, result, req, res })
      } catch {
        // La renovación falló: la sesión conserva el vencimiento anterior.
      }
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

export function requirePermission(requiredPermissions, deps, options = {}) {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions]
  const mode = options.mode === 'any' ? 'any' : 'all'
  // `eventScoped: true` = la ruta filtra por los eventos asignados a la cuenta.
  const auth = requireAuth({ ...deps, allowEventScoped: options.eventScoped === true })

  return [
    auth,
    (req, _res, next) => {
      const allowed =
        mode === 'any'
          ? hasAnyPermission(req.auth.user, permissions)
          : permissions.every((permissionKey) => hasPermission(req.auth.user, permissionKey))

      if (!allowed) {
        next(new HttpError(403, 'No tenés permisos para esta acción.'))
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
