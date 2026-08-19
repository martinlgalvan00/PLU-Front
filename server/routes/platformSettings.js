import { Router } from 'express'
import { z } from 'zod'
import { PUBLIC_CACHE_SECONDS, publicReadCache } from '../lib/http.js'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'
import {
  resolveEnvironmentHolds,
  resolvePublicCheckoutAvailability,
} from '../services/platformFeatureToggleService.js'

/**
 * Tres ejes por concepto: alta de órdenes, canal de pago y validación/activación
 * desde el panel. `checkout` es el maestro que corta todo.
 *
 * Los canales viven en su propia ruta (`PUT /channels`) porque son una matriz
 * concepto × canal, no un booleano por concepto. Los tres `*_manual` siguen
 * acá: el setter de Supabase los conserva como alias que escribe transferencia
 * y efectivo juntos, así que un cliente del contrato anterior no se rompe.
 * La lista blanca equivalente vive en
 * `plu_private.platform_feature_toggle_column` y
 * `plu_private.platform_manual_feature_concept`.
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
]

export const platformFeatureToggleSchema = z.object({
  feature: z.enum(PLATFORM_FEATURES),
  enabled: z.boolean(),
})

export const paymentChannelToggleSchema = z.object({
  concept: z.enum(['membership', 'registration', 'ticket']),
  channel: z.enum(['mercado_pago', 'bank_transfer', 'cash_pitbull']),
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
export function createPlatformSettingsRoutes({
  getPrisma,
  getSupabaseAdmin,
  repository,
  env = process.env,
}) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.registration_access.read', { prisma })
  const writeGuard = requirePermission('admin.registration_access.write', { prisma })
  const repo = () =>
    repository ??
    createSupabasePlatformSettingsRepository(requireSupabaseClient(getSupabaseAdmin()))

  router.get('/public', staffLimiter, async (_req, res, next) => {
    try {
      // Cerrar un canal de pago tiene que llegar al público sin esperar un
      // deploy: 30 s es el techo del atraso entre el toggle y la pantalla.
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.SETTINGS))
      res.json(resolvePublicCheckoutAvailability(await repo().get(), env))
    } catch (error) {
      next(error)
    }
  })

  router.get('/', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      // `environmentHolds` viaja con los interruptores para que el panel pueda
      // decir "este interruptor está en ON pero una variable de entorno lo está
      // frenando", en vez de dejar al staff peleando contra un control sin
      // efecto.
      res.json({ ...(await repo().get()), environmentHolds: resolveEnvironmentHolds(env) })
    } catch (error) {
      next(error)
    }
  })

  router.put(
    '/',
    ...writeGuard,
    staffLimiter,
    validateBody(platformFeatureToggleSchema),
    async (req, res, next) => {
      try {
        const { feature, enabled } = req.validatedBody
        res.json(await repo().setToggle(feature, enabled, actor(req)))
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Una celda de la matriz por request. Cerrar los tres canales de un concepto
   * es un estado válido —equivale a cerrar el alta— y la RPC no lo impide: el
   * panel avisa la consecuencia y el checkout responde
   * `<CONCEPTO>_NO_PAYMENT_CHANNEL` en vez de mostrar un selector vacío.
   */
  router.put(
    '/channels',
    ...writeGuard,
    staffLimiter,
    validateBody(paymentChannelToggleSchema),
    async (req, res, next) => {
      try {
        const { concept, channel, enabled } = req.validatedBody
        res.json(await repo().setPaymentChannel(concept, channel, enabled, actor(req)))
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
