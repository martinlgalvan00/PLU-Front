import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { verifyMercadoPagoWebhook } from '../integrations/webhookVerifier.js'

function stableKey(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}`
}

export function mapMercadoPagoStatus(status) {
  if (status === 'approved') return 'aprobado'
  if (status === 'rejected') return 'rechazado'
  if (status === 'cancelled') return 'cancelado'
  if (status === 'refunded' || status === 'charged_back') return 'reembolsado'
  return 'pendiente'
}

export async function createPaymentPreference(input, options = {}) {
  const { repository, mercadoPago } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'El workflow de pagos no esta configurado.')
  }

  const order = await repository.getOrder(input.paymentOrderId)
  if (order.method !== 'mercado_pago') {
    throw new HttpError(400, 'La orden no usa Mercado Pago.')
  }
  if (!['pendiente', 'creado'].includes(order.status)) {
    throw new HttpError(409, 'La orden ya no admite un nuevo checkout.')
  }
  if (order.preferenceId && order.initPoint) {
    return {
      paymentOrder: order,
      preference: { id: order.preferenceId, initPoint: order.initPoint },
      created: false,
    }
  }

  const idempotencyKey = order.idempotencyKey || stableKey('preference', order.id)
  const preference = await mercadoPago.createPreference({
    order,
    appUrl: input.appUrl,
    apiUrl: input.apiUrl,
    idempotencyKey,
  })
  await repository.attachPreference(order.id, preference, idempotencyKey)

  return {
    paymentOrder: { ...order, idempotencyKey, preferenceId: preference.id, initPoint: preference.initPoint },
    preference: {
      id: preference.id,
      initPoint: preference.initPoint,
      externalReference: preference.externalReference,
    },
    created: true,
  }
}

function notificationKey(body) {
  return [body.id, body.action, body.date_created].filter(Boolean).join(':')
}

function assertPaymentMatchesOrder(payment, orderId) {
  if (String(payment.external_reference ?? '') !== String(orderId)) {
    throw new HttpError(409, 'El pago no pertenece a la orden informada.')
  }
}

export async function applyCanonicalPayment(payment, order, options = {}) {
  const { repository, notifyPaymentApplied } = options
  assertPaymentMatchesOrder(payment, order.id)
  const amount = Number(payment.transaction_amount)
  if (!Number.isInteger(amount) || amount !== order.amount) {
    throw new HttpError(409, 'Monto de pago invalido para la orden.')
  }
  if (String(payment.currency_id ?? '').toUpperCase() !== String(order.currency).toUpperCase()) {
    throw new HttpError(409, 'Moneda de pago invalida para la orden.')
  }

  const appliedPayment = {
    orderId: order.id,
    externalPaymentId: payment.id,
    status: mapMercadoPagoStatus(payment.status),
    amount,
    currency: payment.currency_id,
    payerEmail: payment.payer?.email ?? null,
    statusDetail: payment.status_detail ?? null,
    raw: payment,
  }
  const result = await repository.applyPayment(appliedPayment)
  await notifyPaymentApplied?.({ order, payment: appliedPayment, result })
  return { appliedPayment, result }
}

export async function processPaymentWebhook(input, options = {}) {
  const { repository, mercadoPago, webhookSecret, toleranceSeconds, notifyPaymentApplied } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'El workflow de pagos no esta configurado.')
  }

  const body = input.body ?? {}
  const queryDataId = input.query?.['data.id'] ?? input.query?.data_id
  const bodyDataId = body.data?.id
  if (queryDataId && bodyDataId && String(queryDataId) !== String(bodyDataId)) {
    throw new HttpError(400, 'El identificador del webhook no coincide.')
  }
  const resourceId = queryDataId ?? bodyDataId

  verifyMercadoPagoWebhook({
    xSignature: input.headers?.['x-signature'],
    xRequestId: input.headers?.['x-request-id'],
    dataId: resourceId,
    secret: webhookSecret,
    toleranceSeconds,
  })

  const type = String(input.query?.type ?? body.type ?? '')
  if (!['payment', 'subscription_preapproval', 'subscription_authorized_payment'].includes(type)) {
    throw new HttpError(400, 'Tipo de webhook no soportado.')
  }

  const notificationId = notificationKey(body)
  if (!notificationId) throw new HttpError(400, 'Webhook sin identificador de notificacion.')

  const recorded = await repository.recordWebhook({
    notificationId,
    resourceId: String(resourceId),
    type,
    action: body.action,
    requestId: input.headers?.['x-request-id'],
    payload: body,
  })

  if (!recorded.created && recorded.event.status === 'processed') {
    return { duplicate: true, event: recorded.event }
  }

  try {
    let result
    if (type === 'payment') {
      const payment = await mercadoPago.getPayment(resourceId)
      const orderId = payment.external_reference
      if (!orderId) throw new HttpError(409, 'Pago sin referencia de orden.')
      const order = await repository.getOrder(orderId)
      result = (await applyCanonicalPayment(payment, order, {
        repository,
        notifyPaymentApplied,
      })).result
    } else if (type === 'subscription_preapproval') {
      const subscription = await mercadoPago.getSubscription(resourceId)
      result = await repository.applySubscription?.(subscription)
      if (!result) result = { ignored: true, reason: 'subscription_repository_unavailable' }
    } else {
      const authorizedPayment = await mercadoPago.getAuthorizedPayment(resourceId)
      result = await repository.applyAuthorizedSubscriptionPayment?.(authorizedPayment)
      if (!result) result = { ignored: true, reason: 'subscription_repository_unavailable' }
    }

    const event = await repository.markWebhookProcessed(recorded.event.id, result)
    return { duplicate: false, event, result }
  } catch (error) {
    await repository.markWebhookFailed(recorded.event.id, error)
    throw error
  }
}
