import { Router } from 'express'
import { z } from 'zod'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { queueTransactionalEmail } from '../modules/notifications/notificationWorkflow.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'

const emailSchema = z.object({
  type: z.enum([
    'affiliation_started',
    'payment_approved',
    'registration_confirmed',
    'payment_pending',
    'admin_notification',
  ]),
  to: z.string().trim().email(),
  params: z.record(z.unknown()).optional(),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(8).optional(),
})

const templateEnvByType = {
  affiliation_started: 'BREVO_TEMPLATE_AFFILIATION_STARTED',
  payment_approved: 'BREVO_TEMPLATE_PAYMENT_APPROVED',
  registration_confirmed: 'BREVO_TEMPLATE_REGISTRATION_CONFIRMED',
  payment_pending: 'BREVO_TEMPLATE_PAYMENT_PENDING',
  admin_notification: 'BREVO_TEMPLATE_ADMIN_NOTIFICATION',
}

export function createEmailRoutes(deps = {}) {
  const router = Router()
  const env = deps.env ?? process.env
  const guard = requireAuth({ prisma: deps.getPrisma() })

  router.post('/send', guard, staffLimiter, validateBody(emailSchema), async (req, res, next) => {
    try {
      const { type, ...input } = req.validatedBody
      const client = deps.supabaseAdmin ?? getSupabaseAdmin()
      const repository = deps.repository ?? createSupabaseNotificationRepository(client)
      const brevo = deps.brevo ?? createBrevoAdapter({ env })
      const result = await queueTransactionalEmail(
        type,
        { ...input, templateId: env[templateEnvByType[type]] },
        { repository, brevo },
      )
      res.status(result.created ? 202 : 200).json({ emailLog: result.emailLog })
    } catch (error) {
      next(error)
    }
  })

  return router
}

export default createEmailRoutes
