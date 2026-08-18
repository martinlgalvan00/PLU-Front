import { randomUUID } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { selectCanonicalProviderPayment } from './providerPaymentSelection.js'

export const MOCK_PAYMENT_METHODS = Object.freeze({
  mock_approved: 'approved',
  mock_rejected: 'rejected',
  mock_pending: 'in_process',
  mock_error: 'error',
})

const STATUS_DETAIL = Object.freeze({
  approved: 'accredited',
  rejected: 'cc_rejected_other_reason',
  in_process: 'pending_contingency',
  authorized: 'authorized',
  pending: 'pending_contingency',
})

function assertProviderRequest(order, idempotencyKey) {
  if (!Number.isInteger(order.amount) || order.amount <= 0) {
    throw new HttpError(409, 'La orden tiene un monto invalido.')
  }
  if (!/^[A-Z]{3}$/.test(String(order.currency))) {
    throw new HttpError(409, 'La orden tiene una moneda invalida.')
  }
  if (!idempotencyKey || idempotencyKey.length > 64) {
    throw new HttpError(503, 'Clave de idempotencia de Mercado Pago invalida.')
  }
}

function resolvePaymentStatus(formData = {}) {
  const method = String(formData.payment_method_id ?? '').trim()
  const status = MOCK_PAYMENT_METHODS[method]
  if (!status) {
    throw new HttpError(
      400,
      'payment_method_id mock invalido. Usá mock_approved, mock_rejected, mock_pending o mock_error.',
    )
  }
  return status
}

function clone(value) {
  return structuredClone(value)
}

function resolveDelayMs(env = process.env) {
  const raw = Number(env.MOCK_PAYMENT_DELAY_MS ?? 0)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(Math.trunc(raw), 10_000)
}

async function maybeDelay(env) {
  const delayMs = resolveDelayMs(env)
  if (delayMs <= 0) return
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function logMock(event, payload) {
  console.info(`[payments:mock] ${event}`, payload)
}

/**
 * Adaptador in-memory con la misma interfaz que createMercadoPagoAdapter.
 * El store vive por instancia; se pierde al reiniciar el server (aceptable en local).
 */
export function createMockMercadoPagoAdapter({ store, env = process.env } = {}) {
  const payments = store?.payments ?? new Map()
  const subscriptions = store?.subscriptions ?? new Map()
  const plans = store?.plans ?? new Map()
  const preferences = store?.preferences ?? new Map()
  const authorizedPayments = store?.authorizedPayments ?? new Map()
  const preferenceByIdempotency = store?.preferenceByIdempotency ?? new Map()
  const paymentByIdempotency = store?.paymentByIdempotency ?? new Map()

  return {
    provider: 'mock',

    async createPreference({ order, idempotencyKey }) {
      assertProviderRequest(order, idempotencyKey)
      await maybeDelay(env)
      const existingId = preferenceByIdempotency.get(idempotencyKey)
      if (existingId && preferences.has(existingId)) {
        return clone(preferences.get(existingId))
      }

      const id = `mock_pref_${randomUUID()}`
      const preference = {
        id,
        initPoint: `mock://checkout/${order.id}`,
        sandboxInitPoint: `mock://checkout/${order.id}`,
        externalReference: order.id,
        raw: {
          id,
          external_reference: order.id,
          metadata: {
            payment_order_id: order.id,
            order_kind: order.kind,
            ...(order.athleteId ? { athlete_id: order.athleteId } : {}),
          },
        },
      }
      preferences.set(id, preference)
      preferenceByIdempotency.set(idempotencyKey, id)
      logMock('preference', { preferenceId: id, orderId: order.id })
      return clone(preference)
    },

    async createPayment({ order, formData, idempotencyKey }) {
      assertProviderRequest(order, idempotencyKey)
      await maybeDelay(env)
      const existingId = paymentByIdempotency.get(idempotencyKey)
      if (existingId && payments.has(existingId)) {
        return clone(payments.get(existingId))
      }

      const payerEmail = formData?.payer?.email ?? order.payerEmail
      if (!payerEmail) throw new HttpError(400, 'Mercado Pago requiere el email del pagador.')

      const status = resolvePaymentStatus(formData)
      if (status === 'error') {
        logMock('payment_error', { orderId: order.id, paymentMethodId: formData.payment_method_id })
        throw new HttpError(502, 'Mercado Pago mock simulo una falla del proveedor.')
      }

      const id = `mock_pay_${randomUUID()}`
      const payment = {
        id,
        status,
        status_detail: STATUS_DETAIL[status] ?? null,
        transaction_amount: order.amount,
        currency_id: order.currency,
        payment_method_id: formData.payment_method_id,
        payment_type_id: formData.payment_type_id ?? 'credit_card',
        installments: Number(formData.installments ?? 1),
        external_reference: order.id,
        description: order.displayConcept,
        payer: {
          email: payerEmail,
          ...(formData.payer?.identification
            ? { identification: formData.payer.identification }
            : {}),
          ...(formData.payer?.first_name ? { first_name: formData.payer.first_name } : {}),
          ...(formData.payer?.last_name ? { last_name: formData.payer.last_name } : {}),
        },
        metadata: {
          payment_order_id: order.id,
          order_kind: order.kind,
          ...(order.athleteId ? { athlete_id: order.athleteId } : {}),
        },
      }
      payments.set(id, payment)
      paymentByIdempotency.set(idempotencyKey, id)
      logMock('payment', {
        paymentId: id,
        orderId: order.id,
        status,
        amount: order.amount,
        payerEmail,
      })
      return clone(payment)
    },

    async getPayment(id) {
      const payment = payments.get(String(id))
      if (!payment) throw new HttpError(404, 'Pago mock no encontrado.')
      return clone(payment)
    },

    /**
     * Mismo contrato que el adaptador real: los pagos de la orden buscados por
     * `external_reference`. Sin esto, el retorno del navegador sin `payment_id`
     * y la revalidacion contra el proveedor no se podian probar en local.
     */
    async searchPaymentsForOrder(order) {
      return [...payments.values()]
        .filter((payment) => String(payment.external_reference ?? '') === String(order.id))
        .map(clone)
    },

    async findPaymentForOrder(order) {
      const canonical = selectCanonicalProviderPayment(
        [...payments.values()].filter(
          (payment) => String(payment.external_reference ?? '') === String(order.id),
        ),
      )
      return canonical ? clone(canonical) : null
    },

    /**
     * Solo para harness local: actualizar estado de un pago mock (ej. pending → approved).
     */
    async updatePaymentStatus(id, status) {
      const key = String(id)
      const payment = payments.get(key)
      if (!payment) throw new HttpError(404, 'Pago mock no encontrado.')
      const allowed = new Set([
        'approved',
        'rejected',
        'cancelled',
        'refunded',
        'charged_back',
        'in_process',
        'pending',
      ])
      if (!allowed.has(status)) throw new HttpError(400, 'Estado mock invalido.')
      payment.status = status
      payment.status_detail = STATUS_DETAIL[status] ?? payment.status_detail
      payments.set(key, payment)
      logMock('payment_status', { paymentId: key, status, orderId: payment.external_reference })
      return clone(payment)
    },

    async createSubscriptionPlan({ plan, idempotencyKey }) {
      assertProviderRequest({ amount: plan.price, currency: plan.currency }, idempotencyKey)
      await maybeDelay(env)
      const id = `mock_plan_${plan.code || randomUUID()}`
      const providerPlan = {
        id,
        reason: plan.name,
        external_reference: plan.code,
        auto_recurring: {
          frequency:
            plan.billingFrequency === 'annual' ? 12 * plan.intervalCount : plan.intervalCount,
          frequency_type: 'months',
          transaction_amount: plan.price,
          currency_id: plan.currency,
        },
      }
      plans.set(id, providerPlan)
      logMock('subscription_plan', { planId: id, code: plan.code })
      return clone(providerPlan)
    },

    async createSubscription({ plan, payerEmail, externalReference, idempotencyKey, cardToken }) {
      assertProviderRequest({ amount: plan.price, currency: plan.currency }, idempotencyKey)
      await maybeDelay(env)
      if (!payerEmail) throw new HttpError(400, 'Mercado Pago requiere el email del pagador.')
      const id = `mock_sub_${randomUUID()}`
      const subscription = {
        id,
        status: cardToken ? 'authorized' : 'pending',
        external_reference: externalReference,
        payer_email: payerEmail,
        preapproval_plan_id: plan.providerPlanId || undefined,
        reason: plan.name,
        auto_recurring: plan.providerPlanId
          ? undefined
          : {
              frequency:
                plan.billingFrequency === 'annual' ? 12 * plan.intervalCount : plan.intervalCount,
              frequency_type: 'months',
              transaction_amount: plan.price,
              currency_id: plan.currency,
            },
      }
      subscriptions.set(id, subscription)
      logMock('subscription', {
        subscriptionId: id,
        externalReference,
        status: subscription.status,
        payerEmail,
      })
      return clone(subscription)
    },

    async getSubscription(id) {
      const subscription = subscriptions.get(String(id))
      if (!subscription) throw new HttpError(404, 'Suscripcion mock no encontrada.')
      return clone(subscription)
    },

    async cancelSubscription(id) {
      const subscription = subscriptions.get(String(id))
      if (!subscription) throw new HttpError(404, 'Suscripcion mock no encontrada.')
      subscription.status = 'cancelled'
      subscriptions.set(String(id), subscription)
      logMock('subscription_cancel', { subscriptionId: id })
      return clone(subscription)
    },

    async getAuthorizedPayment(id) {
      const authorized = authorizedPayments.get(String(id))
      if (!authorized) throw new HttpError(404, 'Authorized payment mock no encontrado.')
      return clone(authorized)
    },

    /** Helpers de test / notify */
    _store: { payments, subscriptions, plans, preferences, authorizedPayments },
  }
}
