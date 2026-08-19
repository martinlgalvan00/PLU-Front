import { Router } from 'express'
import { z } from 'zod'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'
import { resolvePublicCheckoutAvailability } from '../services/platformFeatureToggleService.js'

/**
 * Tres ejes por concepto: alta de órdenes, canal manual (transferencia y
 * efectivo) y validación/activación desde el panel. `checkout` es el maestro
 * que corta los tres. La lista blanca equivalente vive en
 * `plu_private.platform_feature_toggle_column`.
 */
export const PLATFORM_FEATURES = [
  'checkout',
  'membership',
  'registration',
  'ticket',
  'membership_manual',
  'registration_manual',
  'ticket_manual',
  'membership_validation',
  'registration_validation',
  'ticket_validation',
  'wise',
]

export const platformFeatureToggleSchema = z.object({
  feature: z.enum(PLATFORM_FEATURES),
  enabled: z.boolean(),
})

function actor(req) {
  return `${req.auth.user.id}:${req.auth.user.email}`
}

/**
 * Interruptores generales de alta. Comparten el permiso de `registration_access`
 * porque las dos cosas responden la misma pregunta operativa —quién puede
 * empezar a afiliarse o inscribirse ahora mismo— y hoy conviven en la misma
 * pantalla del panel.
 */
export function createPlatformSettingsRoutes({ getPrisma, getSupabaseAdmin, repository }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.registration_access.read', { prisma })
  const writeGuard = requirePermission('admin.registration_access.write', { prisma })
  const repo = () => repository ?? createSupabasePlatformSettingsRepository(requireSupabaseClient(getSupabaseAdmin()))

  router.get('/public', staffLimiter, async (_req, res, next) => {
    try {
      res.json(resolvePublicCheckoutAvailability(await repo().get()))
    } catch (error) {
      next(error)
    }
  })

  router.get('/', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json(await repo().get())
    } catch (error) {
      next(error)
    }
  })

  router.put('/', ...writeGuard, staffLimiter, validateBody(platformFeatureToggleSchema), async (req, res, next) => {
    try {
      const { feature, enabled } = req.validatedBody
      res.json(await repo().setToggle(feature, enabled, actor(req)))
    } catch (error) {
      next(error)
    }
  })

  return router
}
