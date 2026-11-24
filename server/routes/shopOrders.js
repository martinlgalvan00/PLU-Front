import { Router } from 'express'
import { z } from 'zod'
import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
import { HttpError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import {
  checkoutLimiter,
  publicReadLimiter,
  staffLimiter,
  ticketPublicWriteLimiter,
  webhookLimiter,
} from '../middleware/rateLimit.js'
import { verifyMercadoPagoWebhook } from '../modules/integrations/webhookVerifier.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { formatArs } from '../modules/notifications/emailTemplates.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  assertPaymentsMockAllowed,
  createPaymentProviderAdapter,
  resolvePaymentsProvider,
} from '../modules/payments/createPaymentProviderAdapter.js'
import {
  createMercadoPagoAdapterForProfileId,
  getPaymentAcrossMercadoPagoAccounts,
  listMercadoPagoWebhookSecrets,
  pickWebhookCredentials,
  resolveMercadoPagoNotificationCredentials,
} from '../modules/payments/mercadoPagoProfileRuntime.js'
import { createSupabasePaymentProfileRepository } from '../modules/payments/supabasePaymentProfileRepository.js'
import {
  assertShopMethodOpen,
  assertShopPaymentMatchesOrder,
  resolveShopCheckoutOptions,
  SHOP_HOLD_MINUTES,
  SHOP_NOTIFICATION_PATH,
  SHOP_PAYMENT_METHODS,
  toBuyerOrderView,
} from '../modules/shop/shopCheckout.js'
import { createSupabaseShopOrderRepository } from '../modules/shop/supabaseShopOrderRepository.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'

const uuid = z.string().uuid()

const orderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: uuid,
        sizeLabel: z
          .string()
          .trim()
          .max(20)
          .optional()
          .nullable()
          .transform((value) => value || null),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
  buyer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .nullable()
      .transform((value) => value || null),
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((value) => value || null),
  }),
  paymentMethod: z.enum(SHOP_PAYMENT_METHODS),
})

const accessSchema = z.object({ accessToken: z.string().trim().min(32).max(200) })

const proofUploadSchema = accessSchema.extend({
  fileName: z.string().trim().min(1).max(120),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  size: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024),
})

const proofSchema = accessSchema.extend({ proofPath: z.string().trim().min(3).max(300) })

const reconcileSchema = accessSchema.extend({
  paymentId: z.union([z.string(), z.number()]).optional(),
})

const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() })

const settingsSchema = z.object({
  mercadoPagoEnabled: z.boolean(),
  bankTransferEnabled: z.boolean(),
  cashEnabled: z.boolean(),
  mercadoPagoProfileId: uuid.nullable().optional(),
  bankTransferProfileId: uuid.nullable().optional(),
  cashInstructions: z.string().trim().max(500).optional().default(''),
  fulfillmentNote: z.string().trim().max(500).optional().default(''),
})

const webhookSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    topic: z.string().optional(),
    data: z
      .object({ id: z.union([z.string(), z.number()]).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .default({})

const mockNotifySchema = accessSchema.extend({
  status: z.enum(['approved', 'rejected', 'in_process', 'refunded']).optional().default('approved'),
})

const PAYMENT_METHOD_LABEL = {
  mercado_pago: 'Mercado Pago',
  bank_transfer: 'Transferencia bancaria',
  cash_on_site: 'Efectivo en el lugar',
}

const SIZE_PART = (item) => (item.sizeLabel ? ` (${item.sizeLabel})` : '')
const itemsSummary = (order) =>
  (order.items ?? [])
    .map((item) => `${item.quantity} × ${item.title}${SIZE_PART(item)}`)
    .join(' · ')

/**
 * Pedidos y cobro de la tienda.
 *
 * Tres medios: Mercado Pago (Checkout Pro), transferencia con comprobante y
 * efectivo en el lugar. El pago de Mercado Pago se acredita SOLO desde acá, con
 * lo que responde la API del proveedor (webhook o retorno): nada de lo que mande
 * el navegador acredita un pedido. Transferencia y efectivo los acredita el
 * staff (`admin.shop.write`).
 *
 * El comprador no tiene cuenta: el token de 256 bits que recibe al crear el
 * pedido es su única llave (se guarda hasheado).
 */
export function createShopOrderRoutes(deps = {}) {
  const router = Router()
  const env = deps.env ?? process.env
  const prisma = typeof deps.getPrisma === 'function' ? deps.getPrisma() : deps.prisma
  const readGuard = requirePermission('admin.shop.read', { prisma })
  const writeGuard = requirePermission('admin.shop.write', { prisma })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')
  const mailer = deps.brevo ?? createBrevoAdapter({ env })

  const client = () => deps.getSupabaseAdmin?.() ?? null
  const repo = () => {
    if (deps.orderRepository) return deps.orderRepository
    const supabase = client()
    if (!supabase) throw new HttpError(503, 'Supabase Admin no esta configurado.')
    return createSupabaseShopOrderRepository(supabase)
  }
  const actorLabel = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const orderIdParam = (req) => {
    const parsed = uuid.safeParse(req.params.orderId)
    if (!parsed.success) throw new HttpError(400, 'Pedido inválido.')
    return parsed.data
  }

  // Los dobles de test no conocen la tabla de interruptores: ahí queda abierto.
  const platformToggles = async () => {
    if (deps.platformSettingsRepository) return deps.platformSettingsRepository.get()
    const supabase = client()
    if (!supabase) return { checkoutEnabled: true }
    try {
      return await createSupabasePlatformSettingsRepository(supabase).get()
    } catch (error) {
      logger.warn('shop.platform_toggles_unavailable', { err: error })
      return { checkoutEnabled: true }
    }
  }

  async function loadCheckoutContext() {
    const orders = repo()
    const settings = await orders.getSettings()
    const bankProfile = settings.bankTransferProfileId
      ? await orders.getBankProfile(settings.bankTransferProfileId).catch(() => null)
      : null
    const options = resolveShopCheckoutOptions({
      settings,
      toggles: await platformToggles(),
      bankProfile,
      env,
    })
    return { settings, options }
  }

  async function mercadoPagoFor(order) {
    if (deps.mercadoPago) return deps.mercadoPago
    return createMercadoPagoAdapterForProfileId(client(), order.mercadoPagoProfileId, { env })
  }

  // ----------------------------------------------------------------- correos
  function mailDispatcher() {
    let notificationRepository = null
    try {
      const supabase = client()
      if (supabase) notificationRepository = createSupabaseNotificationRepository(supabase)
    } catch {
      notificationRepository = null
    }
    return createEmailDispatcher({ repository: notificationRepository, brevo: mailer, env })
  }

  async function sendBestEffort(type, input) {
    try {
      return await mailDispatcher().send(type, input)
    } catch (error) {
      logger.warn(`email.${type}_failed`, { err: error })
      return null
    }
  }

  /**
   * El link del correo lleva el token en el FRAGMENTO (`#t=`): el navegador no
   * lo manda al servidor ni a terceros por referrer, y le da al comprador una
   * forma de volver a su pedido desde otro dispositivo.
   */
  const orderLink = (order, accessToken) =>
    `${appUrl}/tienda?pedido=${encodeURIComponent(order.id)}#t=${encodeURIComponent(accessToken)}`

  async function sendReceived(order, accessToken, options) {
    const instructions =
      order.paymentMethod === 'bank_transfer'
        ? options.bankDetails
          ? `Transferí ${formatArs(order.amount)} a ${[
              options.bankDetails.alias && `alias ${options.bankDetails.alias}`,
              options.bankDetails.cbu && `CBU ${options.bankDetails.cbu}`,
              options.bankDetails.holder && `titular ${options.bankDetails.holder}`,
            ]
              .filter(Boolean)
              .join(' · ')} y subí el comprobante desde tu pedido.`
          : 'Subí el comprobante de la transferencia desde tu pedido.'
        : options.cashInstructions || 'Pagás en efectivo cuando retirás tu pedido.'
    await sendBestEffort('shop_order_received', {
      to: order.buyerEmail,
      toName: order.buyerName,
      entityType: 'shop_order',
      entityId: order.id,
      idempotencyKey: `email:shop-order-received:${order.id}`,
      params: {
        name: order.buyerName,
        reference: order.reference,
        amount: order.amount,
        items: itemsSummary(order),
        paymentMethod: PAYMENT_METHOD_LABEL[order.paymentMethod],
        instructions,
        expiresAt: order.expiresAt,
        orderUrl: orderLink(order, accessToken),
      },
    })
  }

  async function sendConfirmed(order) {
    const { options } = await loadCheckoutContext().catch(() => ({ options: null }))
    await sendBestEffort('shop_order_confirmed', {
      to: order.buyerEmail,
      toName: order.buyerName,
      entityType: 'shop_order',
      entityId: order.id,
      // Una sola vez por acreditación: reaprobar un pedido ya aprobado no reenvía.
      idempotencyKey: `email:shop-order-confirmed:${order.id}`,
      params: {
        name: order.buyerName,
        reference: order.reference,
        amount: order.amount,
        items: itemsSummary(order),
        fulfillmentNote: options?.fulfillmentNote ?? '',
        // Sin token acá: el pedido se recupera desde el correo de "recibimos".
        orderUrl: `${appUrl}/tienda`,
      },
    })
  }

  /** Acredita (o no) lo que respondió la API de Mercado Pago, tras validarlo. */
  async function applyProviderPayment(order, payment) {
    assertShopPaymentMatchesOrder(payment, order)
    const result = await repo().applyMercadoPagoPayment({
      orderId: order.id,
      paymentId: payment.id,
      status: payment.status,
      amount: Number(payment.transaction_amount),
      currency: String(payment.currency_id ?? order.currency).toUpperCase(),
    })
    if (['approved', 'revived'].includes(result.outcome)) await sendConfirmed(result.order)
    return result
  }

  // ---------------------------------------------------------------- público
  router.get('/checkout', publicReadLimiter, async (_req, res, next) => {
    try {
      const { options } = await loadCheckoutContext()
      res.set('Cache-Control', 'private, no-store')
      res.json({
        open: options.open,
        methods: options.methods,
        cashInstructions: options.cashInstructions,
        fulfillmentNote: options.fulfillmentNote,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/orders',
    ticketPublicWriteLimiter,
    validateBody(orderSchema),
    async (req, res, next) => {
      try {
        const { items, buyer, paymentMethod } = req.validatedBody
        const { settings, options } = await loadCheckoutContext()
        assertShopMethodOpen(options, paymentMethod)

        // Antes de reservar, se liberan los pedidos vencidos: el stock que
        // retienen no tiene que bloquear una compra real.
        await repo()
          .expireOrders()
          .catch((error) => logger.warn('shop.expire_before_order_failed', { err: error }))

        const { order, accessToken } = await repo().createOrder({
          items,
          buyer,
          paymentMethod,
          holdMinutes: SHOP_HOLD_MINUTES[paymentMethod],
          mercadoPagoProfileId: settings.mercadoPagoProfileId,
        })
        // Mercado Pago avisa al acreditarse; transferencia y efectivo necesitan
        // las instrucciones ya.
        if (paymentMethod !== 'mercado_pago') await sendReceived(order, accessToken, options)

        res.set('Cache-Control', 'private, no-store')
        res.status(201).json({ order: toBuyerOrderView(order, options), accessToken })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/orders/:orderId', publicReadLimiter, async (req, res, next) => {
    try {
      const orderId = orderIdParam(req)
      const accessToken = req.get('x-order-access-token')
      const order = await repo().getBuyerOrder(orderId, accessToken)
      const { options } = await loadCheckoutContext()
      res.set('Cache-Control', 'private, no-store')
      res.json({ order: toBuyerOrderView(order, options) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/orders/:orderId/pay',
    checkoutLimiter,
    validateBody(accessSchema),
    async (req, res, next) => {
      try {
        const orderId = orderIdParam(req)
        await repo().assertBuyerAccess(orderId, req.validatedBody.accessToken)
        const order = await repo().getOrderForPayment(orderId)
        if (order.method !== 'mercado_pago') {
          throw new HttpError(400, 'Este pedido no se paga con Mercado Pago.')
        }
        if (order.status !== 'pendiente') {
          throw new HttpError(409, 'El pedido ya no admite pago.', { code: 'SHOP_ORDER_CLOSED' })
        }
        if (new Date(order.expiresAt).getTime() <= Date.now()) {
          throw new HttpError(409, 'El pedido venció. Armá uno nuevo.', {
            code: 'SHOP_ORDER_EXPIRED',
          })
        }
        const { options } = await loadCheckoutContext()
        assertShopMethodOpen(options, 'mercado_pago')

        const mercadoPago = await mercadoPagoFor(order)
        const preference = await mercadoPago.createPreference({
          order: {
            ...order,
            notificationPath: SHOP_NOTIFICATION_PATH,
            displayConcept: `Tienda PLU · pedido ${order.reference}`,
          },
          appUrl: env.APP_URL ?? env.VITE_APP_URL,
          apiUrl: env.API_URL,
          idempotencyKey: `shop-pref-${order.id}`,
        })
        await repo().savePreference(order.id, preference.id)
        res.set('Cache-Control', 'private, no-store')
        res.status(201).json({ initPoint: preference.initPoint, preferenceId: preference.id })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * El comprador vuelve de Mercado Pago: se le pregunta a la API qué pasó con
   * SU pedido. El `paymentId` de la URL es solo una pista; la acreditación
   * sale de la respuesta del proveedor, validada contra el pedido.
   */
  router.post(
    '/orders/:orderId/reconcile',
    checkoutLimiter,
    validateBody(reconcileSchema),
    async (req, res, next) => {
      try {
        const orderId = orderIdParam(req)
        const { accessToken, paymentId } = req.validatedBody
        await repo().assertBuyerAccess(orderId, accessToken)
        const order = await repo().getOrderForPayment(orderId)
        if (order.method !== 'mercado_pago') {
          throw new HttpError(400, 'Este pedido no se paga con Mercado Pago.')
        }

        const mercadoPago = await mercadoPagoFor(order)
        const payment = paymentId
          ? await mercadoPago.getPayment(paymentId)
          : await mercadoPago.findPaymentForOrder(order)
        const { options } = await loadCheckoutContext()

        if (!payment) {
          const view = await repo().getBuyerOrder(orderId, accessToken)
          res.status(202).json({ reconciled: false, order: toBuyerOrderView(view, options) })
          return
        }
        const result = await applyProviderPayment(order, payment)
        res.set('Cache-Control', 'private, no-store')
        res.json({
          reconciled: true,
          outcome: result.outcome,
          order: toBuyerOrderView(result.order, options),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/orders/:orderId/proof-upload',
    ticketPublicWriteLimiter,
    validateBody(proofUploadSchema),
    async (req, res, next) => {
      try {
        res.json(
          await repo().createProofUpload(
            orderIdParam(req),
            req.validatedBody.accessToken,
            req.validatedBody.fileName,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/orders/:orderId/proof',
    ticketPublicWriteLimiter,
    validateBody(proofSchema),
    async (req, res, next) => {
      try {
        const order = await repo().registerProof(
          orderIdParam(req),
          req.validatedBody.accessToken,
          req.validatedBody.proofPath,
        )
        const { options } = await loadCheckoutContext()
        res.json({ order: toBuyerOrderView(order, options) })
      } catch (error) {
        next(error)
      }
    },
  )

  // ---------------------------------------------------------------- webhook
  /**
   * Notificación de Mercado Pago para pagos de la tienda (la preferencia trae
   * esta URL como `notification_url`). Mismas garantías que el webhook de
   * entradas: firma HMAC válida, o IPN sin firma donde el id solo sirve para
   * preguntarle a la API —nunca decide nada— y todo se valida contra el pedido.
   */
  router.post(
    '/webhook/mercadopago',
    webhookLimiter,
    validateBody(webhookSchema),
    async (req, res, next) => {
      try {
        const body = req.validatedBody ?? {}
        const queryDataId = req.query['data.id'] ?? req.query.data_id
        const ipnTopic = String(req.query.topic ?? body.topic ?? '').trim()
        const ipnId = req.query.id ?? null
        const isIpn = !queryDataId && Boolean(ipnTopic) && Boolean(ipnId)
        const resourceId = queryDataId ?? ipnId

        if (!resourceId) throw new HttpError(400, 'Webhook sin data.id en la URL.')
        if (queryDataId && body.data?.id && String(queryDataId) !== String(body.data.id)) {
          throw new HttpError(400, 'El identificador del webhook no coincide.')
        }

        let credentials = null
        if (!isIpn) {
          const secrets =
            deps.webhookSecrets ?? (await listMercadoPagoWebhookSecrets(client(), env))
          credentials = pickWebhookCredentials(secrets, (secret) =>
            verifyMercadoPagoWebhook({
              xSignature: req.headers['x-signature'],
              xRequestId: req.headers['x-request-id'] ?? null,
              dataId: resourceId,
              secret,
              toleranceSeconds: Number(env.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS ?? 300),
            }),
          )
        }
        // Cuenta vinculada por OAuth: la firma es de la aplicación de PLU, la
        // cuenta que cobró la dice el `user_id` (ver paymentWorkflow).
        if (!deps.webhookSecrets && body.user_id) {
          credentials =
            (await resolveMercadoPagoNotificationCredentials(
              client(),
              { matched: credentials, userId: body.user_id },
              env,
            )) ?? credentials
        }

        const type = isIpn ? ipnTopic : String(req.query.type ?? body.type ?? '')
        if (type !== 'payment') {
          // Descarte deliberado: un 4xx haría que Mercado Pago reintente algo que
          // nunca se va a procesar (p. ej. merchant_order).
          res.status(200).json({ received: true, ignored: true })
          return
        }

        let payment
        if (deps.mercadoPago) {
          payment = await deps.mercadoPago.getPayment(resourceId)
        } else if (credentials?.accessToken) {
          payment = await createPaymentProviderAdapter({
            env,
            credentials: {
              accessToken: credentials.accessToken,
              webhookSecret: credentials.secret,
              publicKey: credentials.publicKey,
              collectorId: credentials.collectorId,
            },
          }).getPayment(resourceId)
        } else {
          payment = (await getPaymentAcrossMercadoPagoAccounts(client(), resourceId, env)).payment
        }

        const orderId = uuid.safeParse(payment?.external_reference)
        if (!orderId.success) {
          res.status(200).json({ received: true, ignored: true, reason: 'no_order_reference' })
          return
        }
        let order
        try {
          order = await repo().getOrderForPayment(orderId.data)
        } catch (error) {
          if (error?.status !== 404) throw error
          res.status(200).json({ received: true, ignored: true, reason: 'unknown_order' })
          return
        }

        try {
          const result = await applyProviderPayment(order, payment)
          res.status(200).json({ received: true, outcome: result.outcome })
        } catch (error) {
          // Un pago que no coincide con su pedido (monto, moneda, referencia) no
          // mejora reintentando: se registra para revisión y se corta el reintento.
          if (String(error?.code ?? error?.details?.code ?? '').startsWith('SHOP_PAYMENT_')) {
            logger.error('shop.webhook_payment_mismatch', {
              orderId: order.id,
              paymentId: String(payment?.id ?? resourceId),
              err: error,
            })
            res.status(200).json({ received: true, ignored: true, reason: 'payment_mismatch' })
            return
          }
          throw error
        }
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Harness local con el proveedor mock: simula que Mercado Pago cobró (o
   * rechazó) el pedido, y lo acredita por el MISMO camino que el real.
   */
  router.post(
    '/mock/notify/:orderId',
    checkoutLimiter,
    validateBody(mockNotifySchema),
    async (req, res, next) => {
      try {
        if (resolvePaymentsProvider(env) !== 'mock' && !deps.mercadoPago?.updatePaymentStatus) {
          throw new HttpError(503, 'Esta ruta solo funciona con PAYMENTS_MOCK=true.')
        }
        if (!deps.mercadoPago) assertPaymentsMockAllowed(env)
        const orderId = orderIdParam(req)
        const { accessToken, status } = req.validatedBody
        await repo().assertBuyerAccess(orderId, accessToken)
        const order = await repo().getOrderForPayment(orderId)
        const mercadoPago = deps.mercadoPago ?? createPaymentProviderAdapter({ env })
        const methodByStatus = {
          approved: 'mock_approved',
          rejected: 'mock_rejected',
          in_process: 'mock_pending',
          refunded: 'mock_approved',
        }
        let payment = await mercadoPago.createPayment({
          order,
          formData: {
            payment_method_id: methodByStatus[status],
            payer: { email: order.payerEmail },
          },
          idempotencyKey: `shop-mock-${order.id}`,
        })
        if (payment.status !== status) {
          payment = await mercadoPago.updatePaymentStatus(payment.id, status)
        }
        const result = await applyProviderPayment(order, payment)
        const { options } = await loadCheckoutContext()
        res.json({ outcome: result.outcome, order: toBuyerOrderView(result.order, options) })
      } catch (error) {
        next(error)
      }
    },
  )

  // ------------------------------------------------------------------ staff
  router.get('/admin/orders', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const status = z
        .enum(['pendiente', 'aprobado', 'cancelado', 'vencido'])
        .optional()
        .parse(req.query.status)
      res.set('Cache-Control', 'private, no-store')
      res.json({ orders: await repo().listAdminOrders({ status: status ?? null, limit: 200 }) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/admin/orders/:orderId/approve',
    ...writeGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const order = await repo().approveOrder(orderIdParam(req), actorLabel(req))
        await sendConfirmed(order)
        res.json({ order })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/admin/orders/:orderId/cancel',
    ...writeGuard,
    staffLimiter,
    validateBody(cancelSchema),
    async (req, res, next) => {
      try {
        res.json({
          order: await repo().cancelOrder(
            orderIdParam(req),
            actorLabel(req),
            req.validatedBody.reason ?? null,
          ),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/admin/orders/:orderId/fulfill',
    ...writeGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        res.json({ order: await repo().fulfillOrder(orderIdParam(req), actorLabel(req)) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/admin/orders/:orderId/resolve-refund',
    ...writeGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        res.json({ order: await repo().resolveRefund(orderIdParam(req), actorLabel(req)) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get(
    '/admin/orders/:orderId/proof-url',
    ...readGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        res.set('Cache-Control', 'private, no-store')
        res.json({ url: await repo().createProofViewUrl(orderIdParam(req)) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/admin/checkout-settings', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      const orders = repo()
      const settings = await orders.getSettings()
      let profiles = { bank: [], mercadoPago: [] }
      const supabase = client()
      if (supabase) {
        const list = await createSupabasePaymentProfileRepository(supabase)
          .list({ activeOnly: true })
          .catch(() => [])
        profiles = {
          bank: list
            .filter((p) => p.kind === 'bank_transfer')
            .map(({ id, name }) => ({ id, name })),
          mercadoPago: list
            .filter((p) => p.kind === 'mercado_pago')
            .map(({ id, name }) => ({ id, name })),
        }
      }
      const { options } = await loadCheckoutContext()
      res.set('Cache-Control', 'private, no-store')
      res.json({ settings, profiles, effective: { open: options.open, methods: options.methods } })
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/admin/checkout-settings',
    ...writeGuard,
    staffLimiter,
    validateBody(settingsSchema),
    async (req, res, next) => {
      try {
        const settings = await repo().saveSettings(req.validatedBody, actorLabel(req))
        const { options } = await loadCheckoutContext()
        res.json({ settings, effective: { open: options.open, methods: options.methods } })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
