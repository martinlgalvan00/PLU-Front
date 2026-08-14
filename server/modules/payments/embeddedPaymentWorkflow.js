import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { addBreadcrumb } from '../../lib/logger.js'
import {
  PAYMENT_TRAIL_ACTIONS,
  paymentTrailMetadata,
  summarizeFailure,
} from './paymentAuditTrail.js'
import { applyCanonicalPayment, mapMercadoPagoStatus } from './paymentWorkflow.js'

function fingerprint(formData) {
  const sensitiveSource = formData.token || [
    formData.payment_method_id,
    formData.payer?.email,
    formData.payer?.identification?.number,
  ].filter(Boolean).join(':')
  if (!sensitiveSource) throw new HttpError(400, 'Faltan datos del medio de pago.')
  return createHash('sha256').update(String(sensitiveSource)).digest('hex')
}

function idempotencyKey(orderId, tokenFingerprint) {
  return createHash('sha256').update(`brick:${orderId}:${tokenFingerprint}`).digest('hex')
}

function safePayment(payment) {
  return {
    id: String(payment.id),
    status: payment.status,
    statusDetail: payment.status_detail ?? null,
    paymentMethodId: payment.payment_method_id ?? null,
    paymentTypeId: payment.payment_type_id ?? null,
  }
}

export async function processEmbeddedPayment(input, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied, auditTrail } = options
  if (!repository || !mercadoPago) throw new HttpError(503, 'Checkout embebido no configurado.')

  // La ruta ya resolvio la orden para validar que pertenece a la sesion; sin
  // reusarla, cada pago la leia de nuevo con sus joins. Se exige que sea la
  // misma orden que pide el body para que un caller no pueda desalinearlas.
  const order = options.order?.id === input.paymentOrderId
    ? options.order
    : await repository.getOrder(input.paymentOrderId)
  addBreadcrumb('order.resolved', {
    orderId: order.id,
    kind: order.kind,
    status: order.status,
    amount: order.amount,
    reused: options.order?.id === input.paymentOrderId,
  })
  if (order.method !== 'mercado_pago') throw new HttpError(400, 'La orden no usa Mercado Pago.')
  // Si el proveedor alcanzo a acreditar pero el browser perdio la respuesta,
  // el Brick vuelve a enviar el submit. La orden aprobada es la constancia
  // canonica: responderla como duplicada evita un segundo cobro y permite que
  // la pagina cierre el checkout sin mostrar un conflicto falso.
  if (order.status === 'aprobado') {
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.duplicate,
      order,
      status: order.status,
      metadata: { stage: 'embedded', reason: 'order_already_approved' },
    })
    return { payment: null, order, duplicate: true }
  }
  if (['cancelado', 'reembolsado'].includes(order.status)) {
    const error = new HttpError(409, 'La orden ya no admite pagos.')
    await auditTrail?.recordFailure({ stage: 'embedded', order, error })
    throw error
  }

  const tokenFingerprint = fingerprint(input.formData)
  const claimed = await repository.claimEmbeddedAttempt({
    order,
    tokenFingerprint,
    idempotencyKey: idempotencyKey(order.id, tokenFingerprint),
  })
  const attempt = claimed.attempt
  addBreadcrumb('attempt.claimed', {
    attemptId: attempt?.id ?? null,
    created: claimed.created,
    hadExternalPayment: Boolean(attempt?.external_payment_id),
  })

  if (!claimed.created && attempt.external_payment_id) {
    const existingPayment = await mercadoPago.getPayment(attempt.external_payment_id)
    const applied = await applyCanonicalPayment(existingPayment, order, {
      repository,
      notifyPaymentApplied,
      auditTrail,
      stage: 'embedded_replay',
    })
    await repository.completeEmbeddedReconciliation?.(attempt.id, {
      succeeded: true,
      terminal: mapMercadoPagoStatus(existingPayment.status) !== 'pendiente',
    })
    return { payment: safePayment(existingPayment), order: applied.result.order, duplicate: true }
  }
  if (!claimed.created) {
    const error = new HttpError(409, 'El pago ya se está procesando.')
    await auditTrail?.recordFailure({
      stage: 'embedded',
      order,
      error,
      metadata: { attemptId: attempt?.id ?? null },
    })
    throw error
  }

  // El fingerprint identifica el intento sin guardar nada del medio de pago:
  // es un hash del token de tarjeta, que nunca sale del proveedor.
  await auditTrail?.record({
    action: PAYMENT_TRAIL_ACTIONS.attemptClaimed,
    order,
    status: order.status,
    metadata: {
      stage: 'embedded',
      attemptId: attempt.id,
      paymentMethodId: input.formData?.payment_method_id ?? null,
      installments: input.formData?.installments ?? 1,
    },
  })

  try {
    const payment = await mercadoPago.createPayment({
      order,
      formData: input.formData,
      idempotencyKey: attempt.idempotency_key,
    })
    addBreadcrumb('mp.payment_created', {
      externalPaymentId: String(payment.id),
      providerStatus: payment.status,
      statusDetail: payment.status_detail ?? null,
    })
    await repository.completeEmbeddedAttempt(attempt.id, {
      status: 'submitted',
      externalPaymentId: payment.id,
      payload: payment,
    })
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.providerSubmitted,
      order,
      status: payment.status,
      externalPaymentId: payment.id,
      metadata: { stage: 'embedded', attemptId: attempt.id, ...paymentTrailMetadata(payment) },
    })
    const applied = await applyCanonicalPayment(payment, order, {
      repository,
      notifyPaymentApplied,
      auditTrail,
      stage: 'embedded',
    })
    await repository.completeEmbeddedReconciliation?.(attempt.id, {
      succeeded: true,
      terminal: mapMercadoPagoStatus(payment.status) !== 'pendiente',
    })
    return { payment: safePayment(payment), order: applied.result.order, duplicate: false }
  } catch (error) {
    await repository.completeEmbeddedAttempt(attempt.id, {
      status: 'failed',
      error: summarizeFailure(error, { stage: 'embedded' }),
    })
    await auditTrail?.recordFailure({
      stage: 'embedded',
      order,
      error,
      metadata: { attemptId: attempt.id },
    })
    throw error
  }
}
