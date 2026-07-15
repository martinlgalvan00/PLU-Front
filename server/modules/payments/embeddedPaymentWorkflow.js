import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
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
  const { repository, mercadoPago, notifyPaymentApplied } = options
  if (!repository || !mercadoPago) throw new HttpError(503, 'Checkout embebido no configurado.')

  const order = await repository.getOrder(input.paymentOrderId)
  if (order.method !== 'mercado_pago') throw new HttpError(400, 'La orden no usa Mercado Pago.')
  if (['aprobado', 'cancelado', 'reembolsado'].includes(order.status)) {
    throw new HttpError(409, 'La orden ya no admite pagos.')
  }

  const tokenFingerprint = fingerprint(input.formData)
  const claimed = await repository.claimEmbeddedAttempt({
    order,
    tokenFingerprint,
    idempotencyKey: idempotencyKey(order.id, tokenFingerprint),
  })
  const attempt = claimed.attempt

  if (!claimed.created && attempt.external_payment_id) {
    const existingPayment = await mercadoPago.getPayment(attempt.external_payment_id)
    const applied = await applyCanonicalPayment(existingPayment, order, {
      repository,
      notifyPaymentApplied,
    })
    await repository.completeEmbeddedReconciliation?.(attempt.id, {
      succeeded: true,
      terminal: mapMercadoPagoStatus(existingPayment.status) !== 'pendiente',
    })
    return { payment: safePayment(existingPayment), order: applied.result.order, duplicate: true }
  }
  if (!claimed.created) throw new HttpError(409, 'El pago ya se está procesando.')

  try {
    const payment = await mercadoPago.createPayment({
      order,
      formData: input.formData,
      idempotencyKey: attempt.idempotency_key,
    })
    await repository.completeEmbeddedAttempt(attempt.id, {
      status: 'submitted',
      externalPaymentId: payment.id,
      payload: payment,
    })
    const applied = await applyCanonicalPayment(payment, order, {
      repository,
      notifyPaymentApplied,
    })
    await repository.completeEmbeddedReconciliation?.(attempt.id, {
      succeeded: true,
      terminal: mapMercadoPagoStatus(payment.status) !== 'pendiente',
    })
    return { payment: safePayment(payment), order: applied.result.order, duplicate: false }
  } catch (error) {
    await repository.completeEmbeddedAttempt(attempt.id, {
      status: 'failed',
      error: error?.message ?? String(error),
    })
    throw error
  }
}
