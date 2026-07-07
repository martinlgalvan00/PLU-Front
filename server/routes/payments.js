import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../lib/validate.js'
import { createPaymentPreference, processPaymentWebhook } from '../modules/payments/paymentWorkflow.js'

const router = Router()

const preferenceSchema = z.object({
  amount: z.number().int().positive(),
  concept: z.string().trim().min(3),
  athleteId: z.string().trim().min(1).optional(),
  paymentId: z.string().trim().min(1).optional(),
  reference: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(8).optional(),
  orderType: z.enum(['membership', 'event_registration', 'membership_plus_event']).optional(),
  currency: z.string().trim().length(3).optional(),
})

const webhookSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    status: z.string().optional(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine((body) => body.id || body.data?.id, 'Webhook sin identificador externo')

router.post('/preferences', validateBody(preferenceSchema), async (req, res, next) => {
  try {
    const result = await createPaymentPreference(req.validatedBody)
    res.status(result.integrationEvent.created ? 201 : 200).json({
      paymentOrder: result.paymentOrder,
      preference: result.preference,
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

router.post('/webhook', validateBody(webhookSchema), async (req, res, next) => {
  try {
    const result = await processPaymentWebhook(req.validatedBody)
    res.status(result.integrationEvent.created ? 202 : 200).json({
      webhook: result.webhook,
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
