import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { publicWriteLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { requirePermission } from '../middleware/auth.js'
import { createLaunchInterestRepository } from '../modules/launch/launchInterestRepository.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'

const interestSchema = z.object({
  email: z.string().trim().email().max(254),
  source: z.string().trim().min(1).max(80).optional().default('launch_teaser'),
  eventSlug: z.string().trim().min(1).max(120).optional().nullable(),
})

const notifySchema = z.object({
  source: z.string().trim().min(1).max(80),
})

export function createLaunchInterestRoutes(deps = {}) {
  const router = Router()
  const repository =
    deps.launchInterestRepository ??
    createLaunchInterestRepository({ getSupabaseAdmin: deps.getSupabaseAdmin })
  const brevo = deps.brevo ?? createBrevoAdapter({ env: deps.env ?? process.env })
  const prisma = typeof deps.getPrisma === 'function' ? deps.getPrisma() : deps.prisma
  // Permisos del catálogo, no nombres de rol: `ops` y `admin` no existen en el enum
  // `UserRole`, así que la guarda anterior dejaba afuera al Administrador.
  // Ver el resumen es lectura del Dashboard; notificar manda mails masivos.
  const summaryGuard = requirePermission('admin.dashboard.read', { prisma })
  const notifyGuard = requirePermission('admin.events.write', { prisma })

  router.post('/', publicWriteLimiter, validateBody(interestSchema), async (req, res, next) => {
    try {
      if (!repository) throw new HttpError(503, 'Captura de interés no disponible.')
      const result = await repository.upsertInterest({
        email: req.validatedBody.email,
        source: req.validatedBody.source,
        eventSlug: req.validatedBody.eventSlug ?? null,
      })
      res.status(result.created ? 201 : 200).json({
        ok: true,
        created: result.created,
        email: result.email,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/summary', ...summaryGuard, staffLimiter, async (req, res, next) => {
    try {
      if (!repository) throw new HttpError(503, 'Captura de interés no disponible.')
      const summary = await repository.getSummary()
      res.json({ ok: true, summary })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/notify',
    ...notifyGuard,
    staffLimiter,
    validateBody(notifySchema),
    async (req, res, next) => {
      try {
        if (!repository) throw new HttpError(503, 'Captura de interés no disponible.')
        const result = await repository.notifySource(req.validatedBody.source, brevo)
        res.json({ ok: true, count: result.count })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
