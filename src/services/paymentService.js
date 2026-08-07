import { env } from '../config/env.js'
import { apiGet, apiPost, apiRequest } from '../lib/api.js'

export function isMercadoPagoConfigured() {
  return env.mercadoPago.configured
}

export function createPaymentReference(method) {
  if (method === 'mercado_pago') {
    return `MP-${Date.now()}`
  }
  return `MANUAL-${Date.now()}`
}

export function getPaymentStatusForMethod(method) {
  return method === 'mercado_pago' ? 'pendiente' : 'validacion_manual'
}

/**
 * Pone al día el estado de la orden que la pantalla de confirmación viene
 * mostrando, contra las órdenes que trae el snapshot del atleta.
 *
 * `createdOrder` se arma en el momento del alta y se queda con el estado de
 * ese instante. Cuando Mercado Pago acredita, el snapshot se refresca (lo
 * dispara `plu:payment-updated`) pero la confirmación seguía anunciando
 * "pendiente de pago" —con el checkout montado abajo, invitando a pagar de
 * nuevo algo ya pagado— hasta que el atleta recargaba la página.
 *
 * Devuelve el mismo objeto si no hay nada que cambiar, para no re-renderizar
 * de gusto en cada refresco.
 */
export function reconcileCreatedOrder(createdOrder, payments = []) {
  if (!createdOrder?.paymentId) return createdOrder

  const order = payments.find((payment) => payment.id === createdOrder.paymentId)
  if (!order || order.status === createdOrder.status) return createdOrder

  return { ...createdOrder, status: order.status }
}

export async function createPreference({ paymentId, orderAccessToken }) {
  return apiPost('/api/payments/preferences', { paymentOrderId: paymentId, orderAccessToken })
}

export async function processEmbeddedPayment({ paymentOrderId, orderAccessToken, formData }) {
  return apiPost('/api/payments/embedded/process', { paymentOrderId, orderAccessToken, formData })
}

export async function getPaymentOrderStatus(paymentOrderId, orderAccessToken) {
  return apiRequest(`/api/payments/orders/${encodeURIComponent(paymentOrderId)}/status`, {
    headers: orderAccessToken ? { 'X-Order-Access-Token': orderAccessToken } : {},
  })
}

export async function listMembershipPlans() {
  return apiGet('/api/payments/plans')
}

export async function processEmbeddedSubscription({ paymentOrderId, orderAccessToken, planCode, cardToken }) {
  return apiPost('/api/payments/subscriptions/process', { paymentOrderId, orderAccessToken, planCode, cardToken })
}

export async function getPaymentOperations(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiGet(`/api/payments/operations${query}`)
}

export async function recoverPaymentOperations() {
  return apiPost('/api/payments/operations/recover', {})
}

export async function retryPaymentEvent(eventId) {
  return apiPost(`/api/payments/operations/events/${encodeURIComponent(eventId)}/retry`, {})
}

export async function retryPaymentReconciliation(attemptId) {
  return apiPost(`/api/payments/operations/reconciliations/${encodeURIComponent(attemptId)}/retry`, {})
}

export async function validatePayment(paymentOrderId) {
  const result = await getPaymentOrderStatus(paymentOrderId)
  return result.order
}
