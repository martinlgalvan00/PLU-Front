import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { getPrisma } from '../lib/prisma.js'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { validateBody } from '../lib/validate.js'
import {
  assertPaymentsMockAllowed,
  createPaymentProviderAdapter,
  getPaymentsRuntimeStatus,
  resolvePaymentsProvider,
} from '../modules/payments/createPaymentProviderAdapter.js'
import {
  applyCanonicalPayment,
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
import { requirePermission } from '../middleware/auth.js'
import { checkoutLimiter, publicReadLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { ATHLETE_SESSION_COOKIE_NAME, readAthleteSession } from '../services/athleteSessionService.js'

const preferenceSchema = z.object({
  paymentOrderId: z.string().uuid(),
  orderAccessToken: z.string().trim().min(32).optional(),
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
  orderAccessToken: z.string().trim().min(32).optional(),
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
  orderAccessToken: z.string().trim().min(32).optional(),
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

const operationsQuerySchema = z.object({
  status: z.enum(['received', 'processing', 'processed', 'failed', 'skipped']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

const mockNotifySchema = z.object({
  paymentId: z.string().trim().min(1),
  orderId: z.string().uuid().optional(),
  status: z
    .enum(['approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'in_process', 'pending'])
    .optional(),
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
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const financeWriteGuard = requirePermission('admin.payments.approve', { prisma })

  function repository() {
    const client = deps.supabaseAdmin ?? getSupabaseAdmin()
    if (!deps.repository && !client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
    return deps.repository ?? createSupabasePaymentRepository(client)
  }

  function services({ notifications = false } = {}) {
    const client = deps.supabaseAdmin ?? getSupabaseAdmin()
    const result = {
      repository: repository(),
      mercadoPago: deps.mercadoPago ?? createPaymentProviderAdapter({ env }),
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

  async function requireOrderAccess(req, paymentOrderId, accessToken) {
    const paymentRepository = repository()
    const order = await paymentRepository.getOrder(paymentOrderId)
    if (order.kind === 'ticket') {
      await paymentRepository.assertTicketOrderAccess(paymentOrderId, accessToken)
      return order
    }
    const athleteSession = await readAthleteSession({
      client: deps.supabaseAdmin ?? getSupabaseAdmin(),
      token: req.cookies?.[ATHLETE_SESSION_COOKIE_NAME],
    })
    if (!athleteSession || athleteSession.athleteId !== order.athleteId) {
      throw new HttpError(403, 'La orden no pertenece a la sesion actual.')
    }
    return order
  }

  router.post('/preferences', checkoutLimiter, validateBody(preferenceSchema), async (req, res, next) => {
    try {
      await requireOrderAccess(req, req.validatedBody.paymentOrderId, req.validatedBody.orderAccessToken)
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
      await requireOrderAccess(req, req.validatedBody.paymentOrderId, req.validatedBody.orderAccessToken)
      const result = await processEmbeddedPayment(req.validatedBody, services({ notifications: true }))
      res.status(result.duplicate ? 200 : 201).json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get('/orders/:orderId/status', publicReadLimiter, async (req, res, next) => {
    try {
      const orderId = parseInput(z.string().uuid(), req.params.orderId)
      const order = await requireOrderAccess(req, orderId, req.get('x-order-access-token'))
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

  router.get('/plans', publicReadLimiter, async (_req, res, next) => {
    try {
      const plans = await repository().listPlans()
      res.json({ plans: plans.map(serializePlan) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/operations', ...financeReadGuard, staffLimiter, async (req, res, next) => {
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
          ...getPaymentsRuntimeStatus(env),
          recoveryEnabled: env.PAYMENT_RECOVERY_JOB_ENABLED === 'true',
          recoveryIntervalMs: Number(env.PAYMENT_RECOVERY_JOB_INTERVAL_MS) || 60_000,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/operations/recover', ...financeWriteGuard, staffLimiter, async (_req, res, next) => {
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

  router.post('/operations/events/:eventId/retry', ...financeWriteGuard, staffLimiter, async (req, res, next) => {
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

  router.post('/operations/reconciliations/:attemptId/retry', ...financeWriteGuard, staffLimiter, async (req, res, next) => {
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
      await requireOrderAccess(req, req.validatedBody.paymentOrderId, req.validatedBody.orderAccessToken)
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
          // Recuperar y diferir son decisiones distintas. En serverless se
          // procesa inline por defecto y el job queda como red de seguridad.
          deferProcessing: env.PAYMENT_WEBHOOK_DEFER_PROCESSING === 'true',
        },
      )
      res.status(200).json({ received: true, duplicate: result.duplicate })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Harness local: relee un pago mock y aplica el camino canónico sin firma MP.
   * Opcionalmente fuerza un status (pending → approved) antes de acreditar.
   */
  router.post('/mock/notify', checkoutLimiter, validateBody(mockNotifySchema), async (req, res, next) => {
    try {
      if (resolvePaymentsProvider(env) !== 'mock') {
        throw new HttpError(503, 'POST /api/payments/mock/notify solo funciona con PAYMENTS_PROVIDER=mock.')
      }
      assertPaymentsMockAllowed(env)

      const paymentServices = services({ notifications: true })
      const { mercadoPago, repository: paymentRepository, notifyPaymentApplied } = paymentServices
      if (typeof mercadoPago.updatePaymentStatus !== 'function') {
        throw new HttpError(503, 'El adaptador mock no expone updatePaymentStatus.')
      }

      const { paymentId, orderId, status } = req.validatedBody
      let payment = status
        ? await mercadoPago.updatePaymentStatus(paymentId, status)
        : await mercadoPago.getPayment(paymentId)

      const resolvedOrderId = orderId ?? payment.external_reference
      if (!resolvedOrderId) throw new HttpError(409, 'Pago mock sin referencia de orden.')
      await requireOrderAccess(req, resolvedOrderId, req.get('x-order-access-token'))
      const order = await paymentRepository.getOrder(resolvedOrderId)
      const applied = await applyCanonicalPayment(payment, order, {
        repository: paymentRepository,
        notifyPaymentApplied,
      })

      res.status(200).json({
        payment: {
          id: String(payment.id),
          status: payment.status,
          statusDetail: payment.status_detail ?? null,
        },
        order: applied.result.order,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}

export default createPaymentRoutes()
