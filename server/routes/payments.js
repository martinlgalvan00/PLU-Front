import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { getPrisma } from '../lib/prisma.js'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { validateBody } from '../lib/validate.js'
import { createMercadoPagoAdapter } from '../modules/payments/mercadoPagoAdapter.js'
import {
  createPaymentPreference,
  processClaimedPaymentEvent,
  processPaymentWebhook,
} from '../modules/payments/paymentWorkflow.js'
import { processEmbeddedPayment } from '../modules/payments/embeddedPaymentWorkflow.js'
import {
  reconcileClaimedPaymentAttempt,
  recoverPaymentOperations,
} from '../modules/payments/paymentRecoveryWorkflow.js'
import { createSupabasePaymentRepository } from '../modules/payments/supabasePaymentRepository.js'
import {
  createEmbeddedRecurringSubscription,
  serializePlan,
} from '../modules/subscriptions/subscriptionWorkflow.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createPaymentNotificationService } from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { requireRole } from '../middleware/auth.js'

const FINANCE_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']

const preferenceSchema = z.object({
  paymentOrderId: z.string().uuid(),
})

const embeddedPayerSchema = z.object({
  email: z.string().email(),
  identification: z.object({
    type: z.string().trim().min(1),
    number: z.string().trim().min(1),
  }).optional(),
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
}).passthrough()

const embeddedPaymentSchema = z.object({
  paymentOrderId: z.string().uuid(),
  formData: z.object({
    token: z.string().trim().min(10).optional(),
    issuer_id: z.union([z.string(), z.number()]).optional(),
    payment_method_id: z.string().trim().min(1),
    payment_type_id: z.string().trim().min(1).optional(),
    installments: z.coerce.number().int().min(1).max(24).optional(),
    payer: embeddedPayerSchema,
  }),
})

const embeddedSubscriptionSchema = z.object({
  paymentOrderId: z.string().uuid(),
  planCode: z.string().trim().min(2),
  cardToken: z.string().trim().min(10),
})

const webhookSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    type: z.string().optional(),
    action: z.string().optional(),
    date_created: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),
  })
  .passthrough()

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de checkout. Probá nuevamente en unos minutos.' },
})

const operationsQuerySchema = z.object({
  status: z.enum(['received', 'processing', 'processed', 'failed', 'skipped']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

function parseInput(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpError(400, 'Parametros invalidos.')
  return result.data
}

export function createPaymentRoutes(deps = {}) {
  const router = Router()
  const env = deps.env ?? process.env
  const prisma = deps.getPrisma?.() ?? getPrisma()
  const financeGuard = requireRole(FINANCE_ROLES, { prisma })

  function repository() {
    const client = deps.supabaseAdmin ?? getSupabaseAdmin()
    if (!deps.repository && !client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
    return deps.repository ?? createSupabasePaymentRepository(client)
  }

  function services({ notifications = false } = {}) {
    const client = deps.supabaseAdmin ?? getSupabaseAdmin()
    const result = {
      repository: repository(),
      mercadoPago: deps.mercadoPago ?? createMercadoPagoAdapter({ env }),
    }
    if (!notifications) return result
    if (deps.notifyPaymentApplied) result.notifyPaymentApplied = deps.notifyPaymentApplied
    else if (client) {
      result.notifyPaymentApplied = createPaymentNotificationService({
        repository: deps.notificationRepository ?? createSupabaseNotificationRepository(client),
        brevo: deps.brevo ?? createBrevoAdapter({ env }),
        env,
      })
    }
    return result
  }

  router.post('/preferences', checkoutLimiter, validateBody(preferenceSchema), async (req, res, next) => {
    try {
      const result = await createPaymentPreference(
        {
          ...req.validatedBody,
          appUrl: env.APP_URL ?? env.VITE_APP_URL,
          apiUrl: env.API_URL,
        },
        services(),
      )
      res.status(result.created ? 201 : 200).json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/embedded/process', checkoutLimiter, validateBody(embeddedPaymentSchema), async (req, res, next) => {
    try {
      const result = await processEmbeddedPayment(req.validatedBody, services({ notifications: true }))
      res.status(result.duplicate ? 200 : 201).json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get('/orders/:orderId/status', async (req, res, next) => {
    try {
      const orderId = parseInput(z.string().uuid(), req.params.orderId)
      const order = await repository().getOrder(orderId)
      res.json({
        order: {
          id: order.id,
          status: order.status,
          amount: order.amount,
          currency: order.currency,
          reference: order.reference,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/plans', async (_req, res, next) => {
    try {
      const plans = await repository().listPlans()
      res.json({ plans: plans.map(serializePlan) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/operations', ...financeGuard, async (req, res, next) => {
    try {
      const query = parseInput(operationsQuerySchema, req.query)
      const paymentRepository = repository()
      const [summary, events, reconciliations] = await Promise.all([
        paymentRepository.getOperationsSummary(),
        paymentRepository.listIntegrationEvents(query),
        paymentRepository.listReconciliationAttempts(query),
      ])
      res.json({
        summary,
        events,
        reconciliations,
        configuration: {
          recoveryEnabled: env.PAYMENT_RECOVERY_JOB_ENABLED === 'true',
          recoveryIntervalMs: Number(env.PAYMENT_RECOVERY_JOB_INTERVAL_MS) || 60_000,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/operations/recover', ...financeGuard, async (_req, res, next) => {
    try {
      const result = await recoverPaymentOperations({
        ...services({ notifications: true }),
        eventLimit: 50,
        reconciliationLimit: 50,
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/operations/events/:eventId/retry', ...financeGuard, async (req, res, next) => {
    try {
      const eventId = parseInput(z.string().uuid(), req.params.eventId)
      const paymentServices = services({ notifications: true })
      const event = await paymentServices.repository.claimWebhookEvent(eventId, { force: true })
      if (!event) throw new HttpError(409, 'El evento ya fue procesado o esta en ejecucion.')
      const result = await processClaimedPaymentEvent(event, paymentServices)
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/operations/reconciliations/:attemptId/retry', ...financeGuard, async (req, res, next) => {
    try {
      const attemptId = parseInput(z.string().uuid(), req.params.attemptId)
      const paymentServices = services({ notifications: true })
      const attempt = await paymentServices.repository.claimEmbeddedReconciliation(attemptId, { force: true })
      if (!attempt) throw new HttpError(409, 'La conciliacion ya finalizo o esta en ejecucion.')
      const result = await reconcileClaimedPaymentAttempt(attempt, paymentServices)
      res.json({ result })
    } catch (error) {
      next(error)
    }
  })

  router.post('/subscriptions/process', checkoutLimiter, validateBody(embeddedSubscriptionSchema), async (req, res, next) => {
    try {
      const result = await createEmbeddedRecurringSubscription(
        { ...req.validatedBody, appUrl: env.APP_URL ?? env.VITE_APP_URL },
        services(),
      )
      res.status(result.created ? 201 : 200).json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/webhook', validateBody(webhookSchema), async (req, res, next) => {
    try {
      const result = await processPaymentWebhook(
        { body: req.validatedBody, query: req.query, headers: req.headers },
        {
          ...services({ notifications: true }),
          webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
          toleranceSeconds: Number(env.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS ?? 300),
          deferProcessing: env.PAYMENT_RECOVERY_JOB_ENABLED === 'true',
        },
      )
      res.status(200).json({ received: true, duplicate: result.duplicate })
    } catch (error) {
      next(error)
    }
  })

  return router
}

export default createPaymentRoutes()
