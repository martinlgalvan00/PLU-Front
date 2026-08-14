import {
  MercadoPagoConfig,
  Payment,
  PreApproval,
  PreApprovalPlan,
  Preference,
} from 'mercadopago'
import { HttpError } from '../../lib/errors.js'

const DEFAULT_TIMEOUT_MS = 8_000
const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i

function requireAccessToken(env) {
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  if (!accessToken || PLACEHOLDER_PATTERN.test(accessToken)) {
    throw new HttpError(503, 'Mercado Pago no esta configurado en el servidor.')
  }
  if (accessToken.length > 256) throw new HttpError(503, 'Access Token de Mercado Pago invalido.')
  return accessToken
}

function normalizeProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status)
  const detail = error?.message ?? error?.cause?.message ?? 'Error de Mercado Pago.'
  return new HttpError(Number.isInteger(status) && status >= 400 && status < 500 ? 502 : 503, detail)
}

function safeUrl(base, path) {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`)
  return url.toString()
}

function supportsAutoReturn(returnBase) {
  try {
    return new URL(returnBase).protocol === 'https:'
  } catch {
    return false
  }
}

function requireIntegrationUrl(value, label, env) {
  if (!value) throw new HttpError(503, `Falta ${label} para crear el checkout.`)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new HttpError(503, `${label} no es una URL valida.`)
  }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(env.MERCADO_PAGO_ENV !== 'production' && isLocal)) {
    throw new HttpError(503, `${label} debe usar HTTPS.`)
  }
  return url.toString()
}

// Normalmente Vite y Express comparten origen. API_URL queda disponible para
// despliegues con API separada, pero no debe ser obligatorio cuando APP_URL ya
// identifica el origen público que recibe el webhook.
function resolveApiUrl({ apiUrl, appUrl, env }) {
  return apiUrl ?? env.API_URL ?? appUrl ?? env.APP_URL ?? env.VITE_APP_URL
}

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

export function createMercadoPagoAdapter({ env = process.env, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const accessToken = requireAccessToken(env)
  const client = new MercadoPagoConfig({ accessToken, options: { timeout } })
  const preferenceClient = new Preference(client)
  const paymentClient = new Payment(client)
  const subscriptionClient = new PreApproval(client)
  const subscriptionPlanClient = new PreApprovalPlan(client)

  async function getJson(path) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(`https://api.mercadopago.com${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new HttpError(502, body?.message ?? `Mercado Pago respondio ${response.status}.`)
      }
      return body
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw normalizeProviderError(error)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async createPreference({ order, appUrl, apiUrl, idempotencyKey }) {
      assertProviderRequest(order, idempotencyKey)
      const returnBase = requireIntegrationUrl(
        appUrl ?? env.APP_URL ?? env.VITE_APP_URL,
        'APP_URL',
        env,
      )
      const webhookBase = requireIntegrationUrl(
        resolveApiUrl({ apiUrl, appUrl, env }),
        'API_URL o APP_URL',
        env,
      )

      const returnPath = order.kind === 'ticket' ? '/eventos' : '/registro'
      const body = {
        items: [
          {
            id: order.id,
            title: order.displayConcept,
            quantity: 1,
            currency_id: order.currency,
            unit_price: order.amount,
          },
        ],
        payer: order.payerEmail ? { email: order.payerEmail } : undefined,
        external_reference: order.id,
        notification_url: safeUrl(webhookBase, '/api/payments/webhook/mercadopago'),
        back_urls: {
          success: safeUrl(returnBase, `${returnPath}?payment=success&order=${encodeURIComponent(order.id)}`),
          pending: safeUrl(returnBase, `${returnPath}?payment=pending&order=${encodeURIComponent(order.id)}`),
          failure: safeUrl(returnBase, `${returnPath}?payment=failure&order=${encodeURIComponent(order.id)}`),
        },
        ...(supportsAutoReturn(returnBase) ? { auto_return: 'approved' } : {}),
        metadata: {
          payment_order_id: order.id,
          order_kind: order.kind,
          ...(order.athleteId ? { athlete_id: order.athleteId } : {}),
        },
      }

      try {
        const result = await preferenceClient.create({
          body,
          requestOptions: { idempotencyKey },
        })
        return {
          id: result.id,
          initPoint: env.MERCADO_PAGO_ENV === 'sandbox' ? result.sandbox_init_point : result.init_point,
          sandboxInitPoint: result.sandbox_init_point,
          externalReference: result.external_reference,
          raw: result,
        }
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },

    async getPayment(id) {
      try {
        return await paymentClient.get({ id: String(id) })
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },

    async createPayment({ order, formData, idempotencyKey }) {
      assertProviderRequest(order, idempotencyKey)
      const webhookBase = requireIntegrationUrl(
        resolveApiUrl({ env }),
        'API_URL o APP_URL',
        env,
      )
      const payer = {
        email: formData.payer?.email ?? order.payerEmail,
        ...(formData.payer?.identification ? { identification: formData.payer.identification } : {}),
        ...(formData.payer?.first_name ? { first_name: formData.payer.first_name } : {}),
        ...(formData.payer?.last_name ? { last_name: formData.payer.last_name } : {}),
      }
      if (!payer.email) throw new HttpError(400, 'Mercado Pago requiere el email del pagador.')

      try {
        return await paymentClient.create({
          body: {
            transaction_amount: order.amount,
            token: formData.token || undefined,
            description: order.displayConcept,
            installments: Number(formData.installments ?? 1),
            payment_method_id: formData.payment_method_id,
            issuer_id: formData.issuer_id ? String(formData.issuer_id) : undefined,
            payer,
            external_reference: order.id,
            notification_url: safeUrl(webhookBase, '/api/payments/webhook/mercadopago'),
            metadata: {
              payment_order_id: order.id,
              order_kind: order.kind,
              ...(order.athleteId ? { athlete_id: order.athleteId } : {}),
            },
          },
          requestOptions: { idempotencyKey },
        })
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },

    async createSubscriptionPlan({ plan, appUrl, idempotencyKey }) {
      assertProviderRequest({ amount: plan.price, currency: plan.currency }, idempotencyKey)
      const backUrl = requireIntegrationUrl(
        appUrl ?? env.APP_URL ?? env.VITE_APP_URL,
        'APP_URL',
        env,
      )
      try {
        const result = await subscriptionPlanClient.create({
          body: {
            reason: plan.name,
            external_reference: plan.code,
            back_url: backUrl,
            auto_recurring: {
              frequency: plan.billingFrequency === 'annual' ? 12 * plan.intervalCount : plan.intervalCount,
              frequency_type: 'months',
              transaction_amount: plan.price,
              currency_id: plan.currency,
            },
          },
          requestOptions: { idempotencyKey },
        })
        return result
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },

    async createSubscription({ plan, payerEmail, externalReference, appUrl, idempotencyKey, cardToken }) {
      assertProviderRequest({ amount: plan.price, currency: plan.currency }, idempotencyKey)
      const backUrl = requireIntegrationUrl(
        appUrl ?? env.APP_URL ?? env.VITE_APP_URL,
        'APP_URL',
        env,
      )
      try {
        return await subscriptionClient.create({
          body: {
            preapproval_plan_id: plan.providerPlanId || undefined,
            reason: plan.name,
            external_reference: externalReference,
            payer_email: payerEmail,
            card_token_id: cardToken || undefined,
            back_url: backUrl,
            status: cardToken ? 'authorized' : 'pending',
            auto_recurring: plan.providerPlanId
              ? undefined
              : {
                  frequency: plan.billingFrequency === 'annual' ? 12 * plan.intervalCount : plan.intervalCount,
                  frequency_type: 'months',
                  transaction_amount: plan.price,
                  currency_id: plan.currency,
                },
          },
          requestOptions: { idempotencyKey },
        })
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },

    async getSubscription(id) {
      try {
        return await subscriptionClient.get({ id: String(id) })
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },

    async getAuthorizedPayment(id) {
      return getJson(`/authorized_payments/${encodeURIComponent(String(id))}`)
    },
  }
}
