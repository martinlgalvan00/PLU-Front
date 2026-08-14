import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { addBreadcrumb } from '../../lib/logger.js'
import { verifyMercadoPagoWebhook } from '../integrations/webhookVerifier.js'
import {
  PAYMENT_TRAIL_ACTIONS,
  paymentTrailMetadata,
  summarizeFailure,
} from './paymentAuditTrail.js'

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
  const { repository, mercadoPago, auditTrail } = options
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
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.preferenceReused,
      order,
      status: order.status,
      metadata: { preferenceId: order.preferenceId },
    })
    return {
      paymentOrder: order,
      preference: { id: order.preferenceId, initPoint: order.initPoint },
      created: false,
    }
  }

  const idempotencyKey = order.idempotencyKey || stableKey('preference', order.id)
  let preference
  try {
    preference = await mercadoPago.createPreference({
      order,
      appUrl: input.appUrl,
      apiUrl: input.apiUrl,
      idempotencyKey,
    })
    await repository.attachPreference(order.id, preference, idempotencyKey, order.kind)
  } catch (error) {
    // Sin este asiento, una preferencia que nunca se creo era un hueco mudo:
    // el atleta veia "no se pudo abrir el pago" y no quedaba nada del lado
    // nuestro para saber si fue el token, la URL o la base.
    await auditTrail?.recordFailure({
      stage: 'preference',
      order,
      error,
      metadata: { idempotencyKey },
    })
    throw error
  }

  await auditTrail?.record({
    action: PAYMENT_TRAIL_ACTIONS.preferenceCreated,
    order,
    status: order.status,
    severity: 'success',
    metadata: { preferenceId: preference.id, idempotencyKey },
  })

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
  const { repository, notifyPaymentApplied, auditTrail, stage = 'apply' } = options
  try {
    addBreadcrumb('payment.apply_started', {
      stage,
      orderId: order.id,
      externalPaymentId: payment?.id ? String(payment.id) : null,
      providerStatus: payment?.status ?? null,
      // Los dos valores que se comparan: si no coinciden, la falla siguiente
      // ya viene explicada por este paso.
      orderAmount: order.amount,
      paymentAmount: payment?.transaction_amount ?? null,
    })
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
    // `orderKind` viaja aparte del contrato de notificacion: la orden ya se
    // resolvio y valido aca, y el repositorio la releia solo para elegir la RPC.
    const result = await repository.applyPayment({ ...appliedPayment, orderKind: order.kind })
    addBreadcrumb('payment.applied', {
      orderId: order.id,
      status: appliedPayment.status,
      resultOrderStatus: result?.order?.status ?? null,
    })
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.applied,
      order,
      status: appliedPayment.status,
      severity: appliedPayment.status === 'aprobado' ? 'success' : 'info',
      externalPaymentId: payment.id,
      metadata: { stage, ...paymentTrailMetadata(payment) },
    })
    await notifyPaymentApplied?.({ order, payment: appliedPayment, result })
    return { appliedPayment, result }
  } catch (error) {
    // Punto unico donde se acredita: webhook, checkout embebido y conciliacion
    // pasan por aca, asi que este asiento cubre las tres entradas.
    await auditTrail?.recordFailure({
      stage,
      order,
      error,
      externalPaymentId: payment?.id ?? null,
      metadata: paymentTrailMetadata(payment),
    })
    throw error
  }
}

export async function reconcileReturnPayment(input, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied, auditTrail } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'El workflow de pagos no esta configurado.')
  }

  const order = options.order?.id === input.paymentOrderId
    ? options.order
    : await repository.getOrder(input.paymentOrderId)

  if (order.status === 'aprobado') {
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.duplicate,
      order,
      status: order.status,
      metadata: { stage: 'return', reason: 'order_already_approved' },
    })
    return { order, payment: null, reconciled: true, duplicate: true }
  }

  const paymentId = input.paymentId ?? input.collectionId ?? null
  let payment = paymentId ? await mercadoPago.getPayment(paymentId) : null
  if (!payment && typeof mercadoPago.findPaymentForOrder === 'function') {
    payment = await mercadoPago.findPaymentForOrder(order)
  }

  if (!payment) {
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.recoveryRun,
      order,
      status: order.status,
      severity: 'info',
      metadata: {
        stage: 'return',
        reason: 'payment_not_found',
        preferenceId: input.preferenceId ?? null,
      },
    })
    return { order, payment: null, reconciled: false, reason: 'payment_not_found' }
  }

  const applied = await applyCanonicalPayment(payment, order, {
    repository,
    notifyPaymentApplied,
    auditTrail,
    stage: 'return',
  })
  return {
    payment: {
      id: String(payment.id),
      status: payment.status,
      statusDetail: payment.status_detail ?? null,
    },
    order: applied.result.order,
    reconciled: true,
    duplicate: false,
  }
}

export async function processClaimedPaymentEvent(event, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied, auditTrail } = options
  const resourceId = event.resource_id ?? event.resourceId
  const type = event.event_type ?? event.eventType
  if (!resourceId || !type) throw new HttpError(409, 'Evento de pago incompleto.')

  addBreadcrumb('webhook.event_claimed', {
    eventId: event.id,
    type,
    resourceId: String(resourceId),
    attempts: event.attempts_count ?? null,
  })

  try {
    let result
    if (type === 'payment') {
      const payment = await mercadoPago.getPayment(resourceId)
      addBreadcrumb('mp.payment_fetched', {
        externalPaymentId: String(payment.id),
        providerStatus: payment.status,
        externalReference: payment.external_reference ?? null,
      })
      const orderId = payment.external_reference
      if (!orderId) throw new HttpError(409, 'Pago sin referencia de orden.')
      const order = await repository.getOrder(orderId)
      result = (await applyCanonicalPayment(payment, order, {
        repository,
        notifyPaymentApplied,
        auditTrail,
        stage: 'webhook',
      })).result
    } else if (type === 'subscription_preapproval') {
      const subscription = await mercadoPago.getSubscription(resourceId)
      result = await repository.applySubscription?.(subscription)
      if (!result) result = { ignored: true, reason: 'subscription_repository_unavailable' }
    } else if (type === 'subscription_authorized_payment') {
      const authorizedPayment = await mercadoPago.getAuthorizedPayment(resourceId)
      result = await repository.applyAuthorizedSubscriptionPayment?.(authorizedPayment)
      if (!result) result = { ignored: true, reason: 'subscription_repository_unavailable' }
    } else {
      throw new HttpError(400, 'Tipo de webhook no soportado.')
    }

    const completedEvent = await repository.markWebhookProcessed(event.id, result)
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.webhookProcessed,
      entityType: 'payment_integration_event',
      entityId: event.id,
      status: 'processed',
      severity: 'success',
      externalPaymentId: resourceId,
      metadata: { eventType: type, attempts: event.attempts_count ?? null },
    })
    return { event: completedEvent, result }
  } catch (error) {
    // La columna `error` se queda con el resumen accionable (codigo del
    // catalogo + requestId): es lo que ve el operador en el panel. El stack
    // completo va al asiento de auditoria y al log; el error original viaja
    // como `cause` para cualquier repositorio que quiera inspeccionarlo.
    await repository.markWebhookFailed(
      event.id,
      new Error(summarizeFailure(error, { stage: 'webhook' }), { cause: error }),
    )
    await auditTrail?.recordFailure({
      action: PAYMENT_TRAIL_ACTIONS.webhookFailed,
      stage: 'webhook',
      entityType: 'payment_integration_event',
      entityId: event.id,
      externalPaymentId: resourceId,
      error,
      metadata: { eventType: type, attempts: event.attempts_count ?? null },
    })
    throw error
  }
}

export async function processPaymentWebhook(input, options = {}) {
  const {
    repository,
    mercadoPago,
    webhookSecret,
    toleranceSeconds,
    notifyPaymentApplied,
    auditTrail,
    deferProcessing = false,
  } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'El workflow de pagos no esta configurado.')
  }

  const body = input.body ?? {}
  const queryDataId = input.query?.['data.id'] ?? input.query?.data_id
  const bodyDataId = body.data?.id
  const providerRequestId = input.headers?.['x-request-id'] ?? null

  // Una notificacion rechazada antes de persistirse no dejaba ningun rastro:
  // ni en el inbox (todavia no existe la fila) ni en el log. Este asiento es
  // el unico registro de firmas invalidas y payloads mal formados.
  const rejectWebhook = async (error, reason) => {
    await auditTrail?.recordFailure({
      action: PAYMENT_TRAIL_ACTIONS.webhookFailed,
      stage: 'webhook_intake',
      entityType: 'payment_integration_event',
      entityId: String(queryDataId ?? bodyDataId ?? 'unknown'),
      error,
      metadata: { reason, providerRequestId, notificationType: body.type ?? null },
    })
    throw error
  }

  // Mercado Pago firma el data.id de la URL, no el valor del body. Aceptar el
  // fallback del body hace ambiguo el manifiesto HMAC y se aparta del contrato
  // documentado del proveedor.
  if (!queryDataId) {
    await rejectWebhook(new HttpError(400, 'Webhook sin data.id en la URL.'), 'missing_data_id')
  }
  if (queryDataId && bodyDataId && String(queryDataId) !== String(bodyDataId)) {
    await rejectWebhook(
      new HttpError(400, 'El identificador del webhook no coincide.'),
      'data_id_mismatch',
    )
  }
  const resourceId = queryDataId

  try {
    verifyMercadoPagoWebhook({
      xSignature: input.headers?.['x-signature'],
      xRequestId: providerRequestId,
      dataId: resourceId,
      secret: webhookSecret,
      toleranceSeconds,
    })
    addBreadcrumb('webhook.signature_verified', { resourceId: String(resourceId), providerRequestId })
  } catch (error) {
    await rejectWebhook(error, 'signature_rejected')
  }

  const type = String(input.query?.type ?? body.type ?? '')
  if (!['payment', 'subscription_preapproval', 'subscription_authorized_payment'].includes(type)) {
    await rejectWebhook(new HttpError(400, 'Tipo de webhook no soportado.'), 'unsupported_type')
  }

  const notificationId = notificationKey(body)
  if (!notificationId) {
    await rejectWebhook(
      new HttpError(400, 'Webhook sin identificador de notificacion.'),
      'missing_notification_id',
    )
  }

  const recorded = await repository.recordWebhook({
    notificationId,
    resourceId: String(resourceId),
    type,
    action: body.action,
    requestId: providerRequestId,
    payload: body,
  })

  await auditTrail?.record({
    action: PAYMENT_TRAIL_ACTIONS.webhookReceived,
    entityType: 'payment_integration_event',
    entityId: recorded.event.id,
    status: recorded.event.status,
    externalPaymentId: resourceId,
    metadata: {
      eventType: type,
      notificationAction: body.action ?? null,
      providerRequestId,
      created: recorded.created,
    },
  })

  if (recorded.event.status === 'processed') {
    return { duplicate: true, event: recorded.event }
  }

  // Con el worker activo confirmamos la recepcion apenas el evento queda
  // persistido. Mercado Pago no necesita esperar la consulta canonica ni los
  // efectos de dominio; la bandeja durable garantiza que se procesen despues.
  if (deferProcessing) {
    return { accepted: true, deferred: true, duplicate: !recorded.created, event: recorded.event }
  }

  const claimedEvent = repository.claimWebhookEvent
    ? await repository.claimWebhookEvent(recorded.event.id)
    : recorded.event
  if (!claimedEvent) {
    return { duplicate: true, inFlight: true, event: recorded.event }
  }

  const processed = await processClaimedPaymentEvent(claimedEvent, {
    repository,
    mercadoPago,
    notifyPaymentApplied,
    auditTrail,
  })
  return { duplicate: !recorded.created, ...processed }
}
