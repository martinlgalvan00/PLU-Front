import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../lib/validate.js'
import { queueTransactionalEmail } from '../modules/notifications/notificationWorkflow.js'

const router = Router()

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
  templateId: z.union([z.string(), z.number()]).optional(),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(8).optional(),
})

router.post('/send', validateBody(emailSchema), async (req, res, next) => {
  try {
    const { type, ...input } = req.validatedBody
    const result = await queueTransactionalEmail(type, input)
    res.status(result.integrationEvent.created ? 202 : 200).json({
      emailLog: result.emailLog,
      integrationEvent: {
        id: result.integrationEvent.event.id,
        created: result.integrationEvent.created,
        status: result.integrationEvent.event.status,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
