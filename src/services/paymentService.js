import { env } from '../config/env.js'
import { apiGet, apiPost } from '../lib/api.js'

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

export async function createPreference({ paymentId }) {
  return apiPost('/api/payments/preferences', { paymentOrderId: paymentId })
}

export async function processEmbeddedPayment({ paymentOrderId, formData }) {
  return apiPost('/api/payments/embedded/process', { paymentOrderId, formData })
}

export async function getPaymentOrderStatus(paymentOrderId) {
  return apiGet(`/api/payments/orders/${encodeURIComponent(paymentOrderId)}/status`)
}

export async function listMembershipPlans() {
  return apiGet('/api/payments/plans')
}

export async function processEmbeddedSubscription({ paymentOrderId, planCode, cardToken }) {
  return apiPost('/api/payments/subscriptions/process', { paymentOrderId, planCode, cardToken })
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
