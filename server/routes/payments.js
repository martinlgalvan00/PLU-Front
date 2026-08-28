import { Router } from 'express'
import { z } from 'zod'
import {
  derivePaymentProgress,
  serializePaymentProgress,
} from '../../src/lib/paymentProgress.js'
import { HttpError } from '../lib/errors.js'
import {
  assertPaidCheckoutAvailable,
  assertRecurringMembershipAvailable,
  filterPublicMembershipPlans,
} from '../lib/featureAvailability.js'
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
  PAYMENT_RECOVERY_JOB_INTERVAL_MS,
  PAYMENT_WEBHOOK_DEFER_PROCESSING,
  isPaymentRecoveryJobEnabled,
} from '../modules/payments/paymentRuntimeDefaults.js'
import {
  applyCanonicalPayment,
  createPaymentPreference,
  processClaimedPaymentEvent,
  processPaymentWebhook,
  reconcileReturnPayment,
} from '../modules/payments/paymentWorkflow.js'
import { processEmbeddedPayment } from '../modules/payments/embeddedPaymentWorkflow.js'
import {
  reconcileClaimedPaymentAttempt,
  recoverPaymentOperations,
} from '../modules/payments/paymentRecoveryWorkflow.js'
import {
  revalidatePaymentOrder,
  revalidatePaymentOrders,
} from '../modules/payments/paymentRevalidationWorkflow.js'
import { createPaymentAuditTrail } from '../modules/payments/paymentAuditTrail.js'
import { diagnosePaymentFailure } from '../modules/payments/paymentFailureCatalog.js'
import {
  buildAthleteTimeline,
  buildOrderTimeline,
  buildRequestTimeline,
} from '../modules/payments/paymentForensics.js'
import { PRIMARY_ORGANIZATION_ID } from '../lib/organizations.js'
import { createSupabasePaymentRepository } from '../modules/payments/supabasePaymentRepository.js'
import {
  createEmbeddedRecurringSubscription,
  serializePlan,
} from '../modules/subscriptions/subscriptionWorkflow.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createPaymentNotificationService } from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'
import { assertCheckoutEnabled } from '../services/platformFeatureToggleService.js'
import { requirePermission } from '../middleware/auth.js'
import {
  checkoutLimiter,
  paymentTelemetryLimiter,
  publicReadLimiter,
  staffLimiter,
  webhookLimiter,
} from '../middleware/rateLimit.js'
import {
  ATHLETE_SESSION_COOKIE_NAME,
  readAthleteSession,
} from '../services/athleteSessionService.js'

const preferenceSchema = z.object({
  paymentOrderId: z.string().uuid(),
  orderAccessToken: z.string().trim().min(32).optional(),
})

const embeddedPayerSchema = z
  .object({
    email: z.string().email(),
    identification: z
      .object({
        type: z.string().trim().min(1),
        number: z.string().trim().min(1),
      })
      .optional(),
    first_name: z.string().trim().min(1).optional(),
    last_name: z.string().trim().min(1).optional(),
  })
  .passthrough()

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

const paymentClientEventSchema = z.object({
  paymentOrderId: z.string().uuid(),
  orderAccessToken: z.string().trim().min(32).optional(),
  stage: z.enum(['initialization', 'render']),
  errorCode: z.string().trim().max(80).optional(),
  message: z.string().trim().max(240).optional(),
})

const mercadoPagoReturnSchema = z.object({
  paymentOrderId: z.string().uuid(),
  orderAccessToken: z.string().trim().min(32).optional(),
  paymentId: z.union([z.string(), z.number()]).optional(),
  collectionId: z.union([z.string(), z.number()]).optional(),
  preferenceId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
})

const embeddedSubscriptionSchema = z.object({
  paymentOrderId: z.string().uuid(),
  orderAccessToken: z.string().trim().min(32).optional(),
  planCode: z.string().trim().min(2),
  cardToken: z.string().trim().min(10),
})

const webhookSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    date_created: z.string().optional(),
    // La URL (no el body) es la fuente canónica de `data.id`: MP la firma y
    // algunas notificaciones llegan con el body vacío o sin `data`. Exigirlo
    // acá rechazaba la request antes de que `processPaymentWebhook` pudiera
    // registrar el rechazo en la auditoría (ver su validación de `data.id`).
    // El `topic` del formato IPN también puede venir en el body además de la
    // query; `processPaymentWebhook` lo lee de las dos partes.
    topic: z.string().optional(),
    data: z
      .object({ id: z.union([z.string(), z.number()]).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
  // Una IPN puede llegar con el cuerpo vacío o con un content-type que
  // `express.json` no parsea: ahí `req.body` es `undefined` y el schema
  // rebotaba con 400 antes de que nadie mirara la query, que es donde esa
  // notificación trae todo lo que importa (`?topic=payment&id=…`).
  .default({})

const subscriptionsQuerySchema = z.object({
  status: z.enum(['pending', 'authorized', 'paused', 'past_due', 'cancelled', 'ended']).optional(),
  athleteId: z.string().uuid().optional(),
})

const operationsQuerySchema = z.object({
  status: z.enum(['received', 'processing', 'processed', 'failed', 'skipped']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

const failureReasonsQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
})

const revalidationSweepSchema = z.object({
  // Ventana corta por defecto: cada orden es una llamada a la API de Mercado
  // Pago, y las divergencias que importan son recientes (un cobro perdido se
  // reclama a los dias, no a los meses).
  sinceDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  // `apply` es opt-in: el barrido informa antes de tocar nada, para que quien
  // opera vea que se va a corregir.
  apply: z.boolean().optional().default(false),
  statuses: z
    .array(z.enum(['pendiente', 'rechazado', 'cancelado', 'reembolsado', 'aprobado']))
    .min(1)
    .max(5)
    .optional(),
})

const revalidateOrderSchema = z.object({
  apply: z.boolean().optional().default(true),
  // El número de operación que muestra Mercado Pago permite diagnosticar una
  // orden puntual incluso si el webhook nunca llegó a crear un intento local.
  // Sigue siendo sólo una pista: el workflow verifica referencia, monto y
  // moneda contra la orden antes de aplicar cualquier cambio.
  providerPaymentId: z.coerce.string().trim().regex(/^\d+$/).optional(),
})

const mockNotifySchema = z.object({
  paymentId: z.string().trim().min(1),
  orderId: z.string().uuid().optional(),
  status: z
    .enum([
      'approved',
      'rejected',
      'cancelled',
      'refunded',
      'charged_back',
      'in_process',
      'pending',
    ])
    .optional(),
})

function parseInput(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpError(400, 'Parametros invalidos.')
  return result.data
}

/**
 * Un mismo problema (token vencido, secreto faltante) genera decenas de filas
 * fallidas. El panel necesita la lista de causas distintas con cuantas filas
 * arrastra cada una, no cincuenta veces el mismo texto.
 */
function dedupeDiagnoses(rows) {
  const byCode = new Map()
  for (const row of rows) {
    const diagnosis = row?.diagnosis
    if (!diagnosis || diagnosis.severity === 'expected') continue
    const current = byCode.get(diagnosis.code)
    if (current) current.affected += 1
    else byCode.set(diagnosis.code, { ...diagnosis, affected: 1 })
  }
  return [...byCode.values()].sort((a, b) => {
    if (a.severity === b.severity) return b.affected - a.affected
    return a.severity === 'blocker' ? -1 : 1
  })
}

export function createPaymentRoutes(deps = {}) {
  const router = Router()
  const env = deps.env ?? process.env
  const prisma = deps.getPrisma?.() ?? getPrisma()
  const resolveSupabaseAdmin = () =>
    Object.prototype.hasOwnProperty.call(deps, 'supabaseAdmin')
      ? deps.supabaseAdmin
      : getSupabaseAdmin()
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const financeWriteGuard = requirePermission('admin.payments.approve', { prisma })
  // La traza de afiliacion mezcla datos de cobro y de padron: alcanza con
  // poder leer cualquiera de los dos, porque no expone mas que lo que ya se ve
  // en esas secciones (el correo va enmascarado).
  const athleteAuditGuard = requirePermission(
    ['admin.payments.read', 'admin.athletes.read'],
    { prisma },
    { mode: 'any' },
  )

  function repository() {
    const client = resolveSupabaseAdmin()
    if (!deps.repository && !client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
    return deps.repository ?? createSupabasePaymentRepository(client)
  }

  const platformSettingsRepo = () => {
    // Mismo criterio que el resto de las rutas de checkout: los dobles de
    // test no conocen la tabla de interruptores, así que en test quedan
    // abiertos por defecto. En runtime real no hay bypass.
    if (!deps.platformSettingsRepository && (env.NODE_ENV ?? process.env.NODE_ENV) === 'test') {
      return { get: async () => ({ checkoutEnabled: true }) }
    }
    return (
      deps.platformSettingsRepository ??
      createSupabasePlatformSettingsRepository(resolveSupabaseAdmin())
    )
  }

  function services({ notifications = false } = {}) {
    const client = resolveSupabaseAdmin()
    const result = {
      repository: repository(),
      mercadoPago: deps.mercadoPago ?? createPaymentProviderAdapter({ env }),
      // Bitacora del ciclo de cobro. Sin cliente Supabase queda en no-op: la
      // observabilidad se degrada, el cobro no.
      auditTrail: deps.auditTrail ?? createPaymentAuditTrail({ client }),
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
      client: resolveSupabaseAdmin(),
      token: req.cookies?.[ATHLETE_SESSION_COOKIE_NAME],
    })
    if (!athleteSession || athleteSession.athleteId !== order.athleteId) {
      throw new HttpError(403, 'La orden no pertenece a la sesion actual.')
    }
    return order
  }

  // Una orden de entradas o de inscripcion/combo esta ligada a un evento
  // puntual: el gate de cobros tiene que mirar la fecha de ESE evento, no la
  // del evento insignia de la plataforma (ver docs/BUSINESS_RULES.md, ventana
  // "independiente por evento").
  function paidCheckoutOptionsForOrder(order) {
    const event = order.kind === 'ticket' ? order.event : order.registration?.event
    const checkoutKind = order.kind === 'ticket' ? 'ticket' : order.concept
    if (!event) return { client: resolveSupabaseAdmin(), checkoutKind }
    return {
      client: resolveSupabaseAdmin(),
      registrationOpensAt: event.registration_opens_at ?? null,
      skipScheduleLookup: true,
      checkoutKind,
    }
  }

  router.post(
    '/preferences',
    checkoutLimiter,
    validateBody(preferenceSchema),
    async (req, res, next) => {
      try {
        const order = await requireOrderAccess(
          req,
          req.validatedBody.paymentOrderId,
          req.validatedBody.orderAccessToken,
        )
        await assertPaidCheckoutAvailable(env, new Date(), paidCheckoutOptionsForOrder(order))
        assertCheckoutEnabled(await platformSettingsRepo().get())
        const result = await createPaymentPreference(
          {
            ...req.validatedBody,
            appUrl: env.APP_URL ?? env.VITE_APP_URL,
            apiUrl: env.API_URL,
          },
          { ...services(), order },
        )
        res.status(result.created ? 201 : 200).json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/embedded/process',
    checkoutLimiter,
    validateBody(embeddedPaymentSchema),
    async (req, res, next) => {
      try {
        const order = await requireOrderAccess(
          req,
          req.validatedBody.paymentOrderId,
          req.validatedBody.orderAccessToken,
        )
        await assertPaidCheckoutAvailable(env, new Date(), paidCheckoutOptionsForOrder(order))
        assertCheckoutEnabled(await platformSettingsRepo().get())
        const result = await processEmbeddedPayment(req.validatedBody, {
          ...services({ notifications: true }),
          order,
        })
        res.status(result.duplicate ? 200 : 201).json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/return/mercadopago',
    checkoutLimiter,
    validateBody(mercadoPagoReturnSchema),
    async (req, res, next) => {
      try {
        const order = await requireOrderAccess(
          req,
          req.validatedBody.paymentOrderId,
          req.validatedBody.orderAccessToken,
        )
        const result = await reconcileReturnPayment(req.validatedBody, {
          ...services({ notifications: true }),
          order,
        })
        res.status(result.reconciled ? 200 : 202).json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/telemetry',
    paymentTelemetryLimiter,
    validateBody(paymentClientEventSchema),
    async (req, res, next) => {
      try {
        const { paymentOrderId, orderAccessToken, ...event } = req.validatedBody
        const order = await requireOrderAccess(req, paymentOrderId, orderAccessToken)
        await repository().recordClientEvent({ order, ...event })
        res.status(202).json({ accepted: true })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Estado real de un cobro. Devolvia solo `status` — el agregado crudo — asi
   * que la pantalla que espera el retorno de Mercado Pago no tenia con que
   * distinguir "todavia procesando" de "vencio sin pagar" ni con que explicar
   * un rechazo. Ahora viaja el progreso derivado del libro de intentos, que es
   * el mismo que consume la seccion de pagos del atleta.
   */
  router.get('/orders/:orderId/status', publicReadLimiter, async (req, res, next) => {
    try {
      const orderId = parseInput(z.string().uuid(), req.params.orderId)
      const order = await requireOrderAccess(req, orderId, req.get('x-order-access-token'))
      const attempts = await repository()
        .listOrderPayments(order.id, order.kind)
        .catch(() => [])
      const progress = derivePaymentProgress({ order, attempts })

      res.json({
        order: {
          id: order.id,
          status: order.status,
          amount: order.amount,
          currency: order.currency,
          reference: order.reference,
          concept: order.concept,
          displayConcept: order.displayConcept,
          conceptDetail: order.conceptDetail ?? null,
          method: order.method,
          manualPaymentChannel: order.manualPaymentChannel ?? null,
          expiresAt: order.expiresAt ?? null,
          approvedAt: order.approvedAt ?? null,
        },
        progress: serializePaymentProgress(progress),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/plans', publicReadLimiter, async (_req, res, next) => {
    try {
      const plans = filterPublicMembershipPlans(await repository().listPlans(), env)
      res.json({ plans: plans.map(serializePlan) })
    } catch (error) {
      next(error)
    }
  })

  // Cancelacion de suscripciones: accion operativa sobre la suscripcion
  // puntual de un atleta, no un cambio de catalogo — va detras de los mismos
  // permisos de pagos que el resto de este archivo, no de admin.pricing.write.
  router.get('/subscriptions', ...financeReadGuard, staffLimiter, async (req, res, next) => {
    try {
      const filters = parseInput(subscriptionsQuerySchema, req.query)
      const subscriptions = await repository().listSubscriptions(filters)
      res.json({ subscriptions })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/subscriptions/:subscriptionId/cancel',
    ...financeWriteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const subscriptionId = parseInput(z.string().uuid(), req.params.subscriptionId)
        const paymentRepository = repository()
        const subscription = await paymentRepository.getSubscriptionForCancellation(subscriptionId)
        if (!subscription) throw new HttpError(404, 'Suscripcion no encontrada.')
        if (
          !['cancelled', 'ended'].includes(subscription.status) &&
          subscription.provider_subscription_id
        ) {
          await (deps.mercadoPago ?? createPaymentProviderAdapter({ env })).cancelSubscription(
            subscription.provider_subscription_id,
          )
        }
        const cancelled = await paymentRepository.cancelSubscription(
          subscriptionId,
          `${req.auth.user.id}:${req.auth.user.email}`,
        )
        res.json({ subscription: cancelled })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Cada fila fallida sale con su diagnostico: que paso, por que y como se
   * resuelve. Antes el panel mostraba el texto crudo del proveedor y el
   * operador tenia que adivinar si era configuracion, plata sin acreditar o un
   * caso de borde esperable.
   */
  function withDiagnosis(row) {
    if (!row?.error) return row
    const diagnosis = diagnosePaymentFailure({ message: row.error })
    return { ...row, diagnosis }
  }

  router.get('/operations', ...financeReadGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseInput(operationsQuerySchema, req.query)
      const paymentRepository = repository()
      const [summary, events, reconciliations] = await Promise.all([
        paymentRepository.getOperationsSummary(),
        paymentRepository.listIntegrationEvents(query),
        paymentRepository.listReconciliationAttempts(query),
      ])
      const diagnosedEvents = events.map(withDiagnosis)
      const diagnosedReconciliations = reconciliations.map(withDiagnosis)
      const runtime = getPaymentsRuntimeStatus(env)
      res.json({
        summary,
        events: diagnosedEvents,
        reconciliations: diagnosedReconciliations,
        // Bloqueantes activos: config rota o fallas que ningun reintento
        // resuelve solo. Es lo que hay que arreglar antes de reintentar nada.
        blockers: [
          ...runtime.issues.map((issue) => ({
            code: 'RUNTIME_CONFIGURATION',
            title: 'Configuracion de cobros incompleta',
            cause: issue,
            fix: diagnosePaymentFailure({ message: issue }).fix,
            severity: 'blocker',
            scope: 'configuracion',
          })),
          ...dedupeDiagnoses([...diagnosedEvents, ...diagnosedReconciliations]),
        ],
        configuration: {
          ...runtime,
          recoveryEnabled: isPaymentRecoveryJobEnabled(env),
          recoveryIntervalMs: PAYMENT_RECOVERY_JOB_INTERVAL_MS,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Cuántos cobros se cortaron por cada motivo en un rango de fechas, de
   * mayor a menor frecuencia. Reusa el diagnóstico que `paymentAuditTrail`
   * ya guardó en cada asiento fallido — no reclasifica nada de nuevo.
   */
  router.get(
    '/operations/failure-reasons',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const query = parseInput(failureReasonsQuerySchema, req.query)
        const reasons = await repository().getFailureReasonBreakdown(query)
        res.json({ reasons })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Vida completa de una orden: orden, intentos del Brick, notificaciones de
   * MP, asientos del ledger, efecto de dominio y bitacora, en una sola linea
   * de tiempo con el veredicto de hasta donde llego el cobro.
   *
   * Antes esto era cruzar cinco tablas a mano en la base para poder contestarle
   * a un socio por que no le figura la afiliacion.
   */
  router.get(
    '/audit/orders/:orderId',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const orderId = parseInput(z.string().uuid(), req.params.orderId)
        const client = resolveSupabaseAdmin()
        if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
        res.json(
          await buildOrderTimeline(client, {
            orderId,
            organizationId: deps.organizationId ?? PRIMARY_ORGANIZATION_ID,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * El mismo recorrido, buscado por correo o documento.
   *
   * `buildAthleteTimeline` siempre supo resolver por esos dos campos, pero la
   * unica ruta que lo exponia pedia el UUID del atleta. En soporte nadie tiene
   * el UUID: llega un correo o un DNI, y para auditar habia que buscar primero
   * la persona en otra pantalla, copiar el id y recien ahi pedir la traza. Este
   * endpoint elimina ese salto, que era el que hacia que la traza no se usara.
   *
   * Va antes de `/:athleteId` porque Express resuelve por orden de declaracion
   * y una ruta con parametro tomaria cualquier cosa que llegue en esa posicion.
   */
  router.get('/audit/athletes', ...athleteAuditGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseInput(
        z
          .object({
            email: z.string().trim().email().max(160).optional(),
            documentId: z
              .string()
              .trim()
              .min(6)
              .max(20)
              .regex(/^[\d.-]+$/)
              .optional(),
          })
          .refine((value) => value.email || value.documentId, {
            message: 'Indicá un correo o un documento.',
          }),
        req.query,
      )

      const client = resolveSupabaseAdmin()
      if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
      res.json(
        await buildAthleteTimeline(client, {
          email: query.email ?? null,
          // El documento se guarda sin puntos ni guiones; quien lo copia de un DNI
          // los trae, y sin normalizar la busqueda no encontraba a nadie.
          documentId: query.documentId ? query.documentId.replace(/[.-]/g, '') : null,
          organizationId: deps.organizationId ?? PRIMARY_ORGANIZATION_ID,
        }),
      )
    } catch (error) {
      next(error)
    }
  })

  /**
   * Recorrido de afiliacion de un atleta: alta, verificacion de correo,
   * ordenes, pagos y membresia, con el eslabon donde se corto.
   */
  router.get(
    '/audit/athletes/:athleteId',
    ...athleteAuditGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const athleteId = parseInput(z.string().uuid(), req.params.athleteId)
        const client = resolveSupabaseAdmin()
        if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
        res.json(
          await buildAthleteTimeline(client, {
            athleteId,
            organizationId: deps.organizationId ?? PRIMARY_ORGANIZATION_ID,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Que pasó en una operacion puntual. El id sale del header `X-Request-Id`,
   * del cuerpo de un error 500 o de cualquier linea del log.
   */
  router.get(
    '/audit/requests/:requestId',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const requestId = parseInput(z.string().trim().min(8).max(120), req.params.requestId)
        const client = resolveSupabaseAdmin()
        if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
        res.json(
          await buildRequestTimeline(client, {
            requestId,
            organizationId: deps.organizationId ?? PRIMARY_ORGANIZATION_ID,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Revalidacion de una orden contra Mercado Pago.
   *
   * Es la respuesta a "la orden figura cancelada pero la plata entro": relee
   * los pagos que el proveedor tiene contra esa orden y aplica el mismo camino
   * canonico del webhook. No acredita nada por su cuenta — si Mercado Pago no
   * tiene un pago aprobado, el estado no se mueve. Para el caso contrario (el
   * dinero entro por fuera del checkout, sin pago en MP) sigue estando
   * `POST /api/athletes/admin/payment-orders/:orderId/force-settle`, que exige
   * comprobante y motivo.
   */
  router.post(
    '/orders/:orderId/revalidate',
    ...financeWriteGuard,
    staffLimiter,
    validateBody(revalidateOrderSchema),
    async (req, res, next) => {
      try {
        const orderId = parseInput(z.string().uuid(), req.params.orderId)
        const result = await revalidatePaymentOrder(orderId, {
          ...services({ notifications: true }),
          apply: req.validatedBody.apply,
          providerPaymentId: req.validatedBody.providerPaymentId,
          actor: `${req.auth.user.id}:${req.auth.user.email}`,
        })
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Barrido: revalida las ordenes de Mercado Pago que todavia no estan
   * aprobadas y devuelve las que difieren de lo que dice el proveedor. Sin
   * `apply` no toca nada: primero se ve que hay, despues se corrige.
   */
  router.post(
    '/operations/revalidate',
    ...financeWriteGuard,
    staffLimiter,
    validateBody(revalidationSweepSchema),
    async (req, res, next) => {
      try {
        const result = await revalidatePaymentOrders({
          ...services({ notifications: true }),
          ...req.validatedBody,
          actor: `${req.auth.user.id}:${req.auth.user.email}`,
        })
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/operations/recover',
    ...financeWriteGuard,
    staffLimiter,
    async (_req, res, next) => {
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
    },
  )

  router.post(
    '/operations/events/:eventId/retry',
    ...financeWriteGuard,
    staffLimiter,
    async (req, res, next) => {
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
    },
  )

  router.post(
    '/operations/reconciliations/:attemptId/retry',
    ...financeWriteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const attemptId = parseInput(z.string().uuid(), req.params.attemptId)
        const paymentServices = services({ notifications: true })
        const attempt = await paymentServices.repository.claimEmbeddedReconciliation(attemptId, {
          force: true,
        })
        if (!attempt) throw new HttpError(409, 'La conciliacion ya finalizo o esta en ejecucion.')
        const result = await reconcileClaimedPaymentAttempt(attempt, paymentServices)
        res.json({ result })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/subscriptions/process',
    checkoutLimiter,
    validateBody(embeddedSubscriptionSchema),
    async (req, res, next) => {
      try {
        await assertPaidCheckoutAvailable(env, new Date(), { client: resolveSupabaseAdmin() })
        assertCheckoutEnabled(await platformSettingsRepo().get())
        assertRecurringMembershipAvailable(env)
        await requireOrderAccess(
          req,
          req.validatedBody.paymentOrderId,
          req.validatedBody.orderAccessToken,
        )
        const result = await createEmbeddedRecurringSubscription(
          { ...req.validatedBody, appUrl: env.APP_URL ?? env.VITE_APP_URL },
          services(),
        )
        res.status(result.created ? 201 : 200).json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  const handleMercadoPagoWebhook = async (req, res, next) => {
    try {
      const result = await processPaymentWebhook(
        { body: req.validatedBody, query: req.query, headers: req.headers },
        {
          ...services({ notifications: true }),
          webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
          toleranceSeconds: Number(env.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS ?? 300),
          // Recovery siempre activo; webhook inline + job como red de seguridad.
          deferProcessing: PAYMENT_WEBHOOK_DEFER_PROCESSING,
        },
      )
      res.status(200).json({
        received: true,
        duplicate: Boolean(result.duplicate),
        // Descarte deliberado (p.ej. merchant_order): se confirma con 200 para
        // que MP no lo reintente, y se dice que se ignoro para el diagnostico.
        ...(result.ignored ? { ignored: true } : {}),
      })
    } catch (error) {
      next(error)
    }
  }

  // Canónico: discrimina proveedor (mismo patrón que /api/emails/webhook/brevo).
  router.post(
    '/webhook/mercadopago',
    webhookLimiter,
    validateBody(webhookSchema),
    handleMercadoPagoWebhook,
  )
  // Alias legacy: notificaciones ya registradas en panel MP con el path corto.
  router.post('/webhook', webhookLimiter, validateBody(webhookSchema), handleMercadoPagoWebhook)

  /**
   * Harness local: relee un pago mock y aplica el camino canónico sin firma MP.
   * Opcionalmente fuerza un status (pending → approved) antes de acreditar.
   */
  router.post(
    '/mock/notify',
    checkoutLimiter,
    validateBody(mockNotifySchema),
    async (req, res, next) => {
      try {
        if (resolvePaymentsProvider(env) !== 'mock') {
          throw new HttpError(
            503,
            'POST /api/payments/mock/notify solo funciona con PAYMENTS_MOCK=true.',
          )
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
        const order = await requireOrderAccess(
          req,
          resolvedOrderId,
          req.get('x-order-access-token'),
        )
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
    },
  )

  return router
}

export default createPaymentRoutes()
