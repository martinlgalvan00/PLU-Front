import {
  MercadoPagoConfig,
  Payment,
  PreApproval,
  PreApprovalPlan,
  Preference,
} from 'mercadopago'
import { HttpError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { normalizeOfficialHost, resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'

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

/**
 * El SDK de Mercado Pago deja el detalle util enterrado: `cause` trae el array
 * `[{ code, description }]` con el motivo real del rechazo y `error`/`message`
 * el texto corto. Quedarse solo con `message` producia logs como "Error de
 * Mercado Pago." sin forma de saber si fue el token, el monto o la tarjeta.
 *
 * Se preserva el error original como `cause` (el logger recorre la cadena y
 * conserva su stack) y se adjunta `provider` con lo que sirve para el
 * diagnostico. Nada de esto viaja al cliente: `errorHandler` responde el
 * mensaje corto y todo el detalle queda en el log y en la auditoria.
 */
function providerDetail(error) {
  const causes = Array.isArray(error?.cause)
    ? error.cause
    : Array.isArray(error?.cause?.cause)
      ? error.cause.cause
      : []
  const first = causes[0] ?? null
  return {
    code: first?.code ?? error?.error ?? error?.code ?? null,
    detail: first?.description ?? error?.cause?.message ?? null,
    causes: causes
      .slice(0, 5)
      .map((item) => ({ code: item?.code ?? null, description: item?.description ?? null })),
    apiResponseStatus: Number(error?.status ?? error?.statusCode ?? error?.response?.status) || null,
    // El request id de MP es la clave para abrir un reclamo con su soporte.
    providerRequestId:
      error?.headers?.['x-request-id']
      ?? error?.response?.headers?.['x-request-id']
      ?? error?.idempotencyKey
      ?? null,
  }
}

function normalizeProviderError(error, context = {}) {
  const provider = providerDetail(error)
  const status = provider.apiResponseStatus
  const detail = error?.message ?? error?.cause?.message ?? 'Error de Mercado Pago.'
  const httpError = new HttpError(
    Number.isInteger(status) && status >= 400 && status < 500 ? 502 : 503,
    provider.detail ? `${detail} (${provider.detail})` : detail,
    { code: provider.code ?? undefined },
    { cause: error },
  )
  httpError.provider = provider
  logger.error('mercadopago.request_failed', { ...context, provider, err: error })
  return httpError
}

/** Ejecuta una llamada al proveedor midiendo latencia y normalizando la falla. */
async function callProvider(operation, context, run) {
  const startedAt = process.hrtime.bigint()
  try {
    const result = await run()
    logger.info('mercadopago.request', {
      operation,
      ...context,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
      outcome: 'ok',
    })
    return result
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw normalizeProviderError(error, {
      operation,
      ...context,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
    })
  }
}

// Sin category_id explicito, Mercado Pago clasifica el titulo del item con
// su propio clasificador de texto y puede acertar cualquier cosa (p. ej.
// "Plan Nutricional" para "Afiliacion PLU"). IDs verificados contra
// GET /item_categories.
function categoryIdForOrder(order) {
  return order.kind === 'ticket' ? 'tickets' : 'services'
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

function resolveIntegrationUrl({ explicit, fallback, label, env }) {
  return requireIntegrationUrl(
    explicit ?? fallback ?? resolveDeploymentAppUrl(env),
    label,
    env,
  )
}

/**
 * Punto unico por donde pasan las dos URLs que se le mandan a Mercado Pago
 * (`notification_url` y `back_urls`), asi que es el lugar correcto para
 * normalizar el host: cubre las dos sin depender de que cada llamador se
 * acuerde. Ver `normalizeOfficialHost` para por que el apex no sirve.
 */
function requireIntegrationUrl(rawValue, label, env) {
  const value = normalizeOfficialHost(rawValue)
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
  return apiUrl ?? env.API_URL ?? appUrl ?? env.APP_URL ?? env.VITE_APP_URL ?? resolveDeploymentAppUrl(env)
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
        const httpError = new HttpError(
          502,
          body?.message ?? `Mercado Pago respondio ${response.status}.`,
        )
        // El cuerpo de error de MP trae el motivo real; sin esto el log decia
        // solo "Mercado Pago respondio 400" y no habia como diagnosticarlo.
        httpError.provider = {
          code: body?.error ?? null,
          detail: body?.message ?? null,
          causes: Array.isArray(body?.cause) ? body.cause.slice(0, 5) : [],
          apiResponseStatus: response.status,
          providerRequestId: response.headers.get('x-request-id'),
        }
        logger.error('mercadopago.request_failed', {
          operation: 'getJson',
          path,
          provider: httpError.provider,
          err: httpError,
        })
        throw httpError
      }
      return body
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw normalizeProviderError(error, { operation: 'getJson', path })
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async createPreference({ order, appUrl, apiUrl, idempotencyKey }) {
      assertProviderRequest(order, idempotencyKey)
      const returnBase = resolveIntegrationUrl({
        explicit: appUrl ?? env.APP_URL ?? env.VITE_APP_URL,
        label: 'APP_URL',
        env,
      })
      const webhookBase = requireIntegrationUrl(
        resolveApiUrl({ apiUrl, appUrl, env }),
        'API_URL o APP_URL',
        env,
      )

      const returnPath = order.kind === 'ticket' ? '/eventos' : '/perfil'
      const body = {
        items: [
          {
            id: order.id,
            title: order.displayConcept,
            category_id: categoryIdForOrder(order),
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

      const result = await callProvider(
        'createPreference',
        { orderId: order.id, orderKind: order.kind, amount: order.amount },
        () => preferenceClient.create({ body, requestOptions: { idempotencyKey } }),
      )
      return {
        id: result.id,
        initPoint: env.MERCADO_PAGO_ENV === 'sandbox' ? result.sandbox_init_point : result.init_point,
        sandboxInitPoint: result.sandbox_init_point,
        externalReference: result.external_reference,
        raw: result,
      }
    },

    async getPayment(id) {
      return callProvider('getPayment', { externalPaymentId: String(id) }, () =>
        paymentClient.get({ id: String(id) }))
    },

    async findPaymentForOrder(order) {
      const response = await getJson(
        `/v1/payments/search?external_reference=${encodeURIComponent(String(order.id))}&sort=date_created&criteria=desc`,
      )
      const results = Array.isArray(response?.results) ? response.results : []
      return results.find((payment) => String(payment.external_reference ?? '') === String(order.id)) ?? null
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

      return callProvider(
        'createPayment',
        {
          orderId: order.id,
          orderKind: order.kind,
          amount: order.amount,
          paymentMethodId: formData.payment_method_id,
          installments: Number(formData.installments ?? 1),
        },
        () => paymentClient.create({
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
        }),
      )
    },

    async createSubscriptionPlan({ plan, appUrl, idempotencyKey }) {
      assertProviderRequest({ amount: plan.price, currency: plan.currency }, idempotencyKey)
      const backUrl = requireIntegrationUrl(
        appUrl ?? env.APP_URL ?? env.VITE_APP_URL,
        'APP_URL',
        env,
      )
      return callProvider(
        'createSubscriptionPlan',
        { planCode: plan.code, amount: plan.price },
        () => subscriptionPlanClient.create({
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
        }),
      )
    },

    async createSubscription({ plan, payerEmail, externalReference, appUrl, idempotencyKey, cardToken }) {
      assertProviderRequest({ amount: plan.price, currency: plan.currency }, idempotencyKey)
      const backUrl = requireIntegrationUrl(
        appUrl ?? env.APP_URL ?? env.VITE_APP_URL,
        'APP_URL',
        env,
      )
      return callProvider(
        'createSubscription',
        { planCode: plan.code, externalReference, amount: plan.price },
        () => subscriptionClient.create({
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
        }),
      )
    },

    async getSubscription(id) {
      return callProvider('getSubscription', { subscriptionId: String(id) }, () =>
        subscriptionClient.get({ id: String(id) }))
    },

    async cancelSubscription(id) {
      return callProvider('cancelSubscription', { subscriptionId: String(id) }, () =>
        subscriptionClient.update({ id: String(id), body: { status: 'cancelled' } }))
    },

    async getAuthorizedPayment(id) {
      return getJson(`/authorized_payments/${encodeURIComponent(String(id))}`)
    },
  }
}
