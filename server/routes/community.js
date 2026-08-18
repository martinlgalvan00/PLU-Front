import { Router } from 'express'
import { z } from 'zod'
import { publicReadLimiter } from '../middleware/rateLimit.js'
import { createSupabaseCommunityRepository } from '../modules/community/supabaseCommunityRepository.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
})

export function createCommunityRoutes(deps = {}) {
  const router = Router()
  const repository =
    deps.communityRepository ??
    createSupabaseCommunityRepository({
      getSupabaseAdmin: deps.getSupabaseAdmin,
    })

  router.get('/spotlight', publicReadLimiter, async (req, res, next) => {
    try {
      const parsed = querySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: 'Parámetros inválidos.' })
        return
      }
      const spotlight = await repository.getSpotlight(parsed.data.limit)
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
      res.json(spotlight)
    } catch (error) {
      next(error)
    }
  })

  return router
}
