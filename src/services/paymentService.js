import { env } from '../config/env.js'
import { apiGet, apiPost, apiRequest } from '../lib/api.js'
import { filterPublicMembershipPlans } from '../lib/featureAvailability.js'

const MEMBERSHIP_PLANS_CACHE_MS = 5 * 60 * 1000
let membershipPlansCache = null
let membershipPlansFetchedAt = 0
let membershipPlansRequest = null

export function filterMembershipPlansForApp(
  plans,
  { appProduction = env.appProduction } = {},
) {
  return filterPublicMembershipPlans(plans, { appProduction })
}

export function isMercadoPagoConfigured() {
  return env.payments.isMock || env.mercadoPago.configured
}

export function isPaymentsMockEnabled() {
  return env.payments.isMock
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

export function paymentUpdateStatus(status) {
  if (status === 'approved' || status === 'aprobado') return 'aprobado'
  if (status === 'rejected' || status === 'rechazado') return 'rechazado'
  if (status === 'cancelled' || status === 'cancelado') return 'cancelado'
  if (status === 'refunded' || status === 'reembolsado') return 'reembolsado'
  return 'pendiente'
}

export function applyPaymentUpdate(createdOrder, tickets = [], detail = {}) {
  const orderId = detail.orderId
  if (!orderId) return { createdOrder, tickets }

  const status = paymentUpdateStatus(detail.status)
  const matchesOrder = createdOrder?.paymentId === orderId || createdOrder?.orderId === orderId
  const nextOrder = matchesOrder ? { ...createdOrder, status } : createdOrder
  const nextTickets = status === 'aprobado'
    ? tickets.map((ticket) => ticket.orderId === orderId ? { ...ticket, status: 'pagada' } : ticket)
    : tickets

  return { createdOrder: nextOrder, tickets: nextTickets }
}

export async function createPreference({ paymentId, orderAccessToken }) {
  return apiPost('/api/payments/preferences', { paymentOrderId: paymentId, orderAccessToken })
}

export async function processEmbeddedPayment({ paymentOrderId, orderAccessToken, formData }) {
  return apiPost('/api/payments/embedded/process', { paymentOrderId, orderAccessToken, formData })
}

export async function reportPaymentClientEvent({
  paymentOrderId,
  orderAccessToken,
  stage,
  errorCode,
  message,
}) {
  return apiPost('/api/payments/telemetry', {
    paymentOrderId,
    orderAccessToken,
    stage,
    ...(errorCode ? { errorCode } : {}),
    ...(message ? { message } : {}),
  })
}

export async function getPaymentOrderStatus(paymentOrderId, orderAccessToken) {
  return apiRequest(`/api/payments/orders/${encodeURIComponent(paymentOrderId)}/status`, {
    headers: orderAccessToken ? { 'X-Order-Access-Token': orderAccessToken } : {},
  })
}

export async function listMembershipPlans({ force = false } = {}) {
  const cacheFresh =
    membershipPlansCache && Date.now() - membershipPlansFetchedAt < MEMBERSHIP_PLANS_CACHE_MS
  if (!force && cacheFresh) return membershipPlansCache
  if (!force && membershipPlansRequest) return membershipPlansRequest

  membershipPlansRequest = apiGet('/api/payments/plans')
    .then((result) => {
      membershipPlansCache = {
        ...result,
        plans: filterMembershipPlansForApp(result?.plans),
      }
      membershipPlansFetchedAt = Date.now()
      return membershipPlansCache
    })
    .finally(() => {
      membershipPlansRequest = null
    })

  return membershipPlansRequest
}

/** Solo para aislar pruebas o invalidar después de editar tarifas en admin. */
export function clearMembershipPlansCache() {
  membershipPlansCache = null
  membershipPlansFetchedAt = 0
  membershipPlansRequest = null
}

export async function processEmbeddedSubscription({ paymentOrderId, orderAccessToken, planCode, cardToken }) {
  return apiPost('/api/payments/subscriptions/process', { paymentOrderId, orderAccessToken, planCode, cardToken })
}

export async function notifyMockPayment({ paymentId, orderId, orderAccessToken, status }) {
  return apiRequest('/api/payments/mock/notify', {
    method: 'POST',
    headers: orderAccessToken ? { 'X-Order-Access-Token': orderAccessToken } : {},
    body: JSON.stringify({ paymentId, orderId, ...(status ? { status } : {}) }),
  })
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

/**
 * Vida completa de una orden: orden, intentos, notificaciones de MP, ledger,
 * efecto de dominio y fallas con su diagnóstico. Es lo que responde "por qué
 * este cobro no se acreditó" sin salir del panel.
 */
export async function getPaymentOrderAudit(orderId) {
  return apiGet(`/api/payments/audit/orders/${encodeURIComponent(orderId)}`)
}

/** Recorrido de afiliación de un atleta, con el eslabón donde se cortó. */
export async function getAthleteAudit(athleteId) {
  return apiGet(`/api/payments/audit/athletes/${encodeURIComponent(athleteId)}`)
}

/** Qué pasó en una operación puntual (id del header `X-Request-Id`). */
export async function getRequestAudit(requestId) {
  return apiGet(`/api/payments/audit/requests/${encodeURIComponent(requestId)}`)
}

export async function validatePayment(paymentOrderId) {
  const result = await getPaymentOrderStatus(paymentOrderId)
  return result.order
}
