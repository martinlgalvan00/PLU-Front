import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { publicWriteLimiter } from '../middleware/rateLimit.js'
import { createLaunchInterestRepository } from '../modules/launch/launchInterestRepository.js'

const interestSchema = z.object({
  email: z.string().trim().email().max(254),
  source: z.string().trim().min(1).max(80).optional().default('launch_teaser'),
  eventSlug: z.string().trim().min(1).max(120).optional().nullable(),
})

export function createLaunchInterestRoutes(deps = {}) {
  const router = Router()
  const repository =
    deps.launchInterestRepository
    ?? createLaunchInterestRepository({ getSupabaseAdmin: deps.getSupabaseAdmin })

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

  return router
}
