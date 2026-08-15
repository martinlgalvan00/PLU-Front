import { Router } from 'express'
import { z } from 'zod'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createSupabaseAdminQueueRepository } from '../modules/adminQueue/supabaseAdminQueueRepository.js'

const dismissSchema = z.object({
  itemKey: z.string().trim().min(1).max(120),
  itemType: z.string().trim().min(1).max(60),
})

function actor(req) {
  return `${req.auth.user.id}:${req.auth.user.email}`
}

export function createAdminQueueRoutes({ getPrisma, getSupabaseAdmin, repository }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.dashboard.read', { prisma })
  const writeGuard = requirePermission('admin.dashboard.write', { prisma })
  const repo = () => repository ?? createSupabaseAdminQueueRepository(requireSupabaseClient(getSupabaseAdmin()))

  router.get('/', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json(await repo().list())
    } catch (error) {
      next(error)
    }
  })

  router.post('/', ...writeGuard, staffLimiter, validateBody(dismissSchema), async (req, res, next) => {
    try {
      const { itemKey, itemType } = req.validatedBody
      const dismissed = await repo().dismiss(itemKey, itemType, actor(req))
      res.json({ dismissed })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:itemKey', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const restored = await repo().undismiss(req.params.itemKey, actor(req))
      res.json({ restored })
    } catch (error) {
      next(error)
    }
  })

  return router
}
