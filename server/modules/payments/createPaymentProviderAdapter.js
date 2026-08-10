import { HttpError } from '../../lib/errors.js'
import { createMercadoPagoAdapter } from './mercadoPagoAdapter.js'
import { createMockMercadoPagoAdapter } from './mockMercadoPagoAdapter.js'
import { PAYMENT_WEBHOOK_DEFER_PROCESSING } from './paymentRuntimeDefaults.js'

const PRODUCTIVE_VERCEL = new Set(['production', 'preview'])
const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i

/** Store compartido entre requests del mismo proceso (solo mock). */
let sharedMockAdapter = null

export function isPaymentsMockEnvironmentAllowed(env = process.env) {
  if (env.NODE_ENV === 'production') return false
  if (PRODUCTIVE_VERCEL.has(String(env.VERCEL_ENV ?? '').toLowerCase())) return false
  return true
}

function parsePaymentsMockFlag(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (['true', '1', 'yes'].includes(raw)) return true
  if (['false', '0', 'no'].includes(raw)) return false
  throw new HttpError(503, `PAYMENTS_MOCK invalido: ${value}. Usá true o false.`)
}

export function resolvePaymentsProvider(env = process.env) {
  // Flag boolean tiene prioridad. PAYMENTS_PROVIDER queda como alias legacy.
  const mockFlag = parsePaymentsMockFlag(env.PAYMENTS_MOCK)
  if (mockFlag === true) return 'mock'
  if (mockFlag === false) return 'mercado_pago'

  const raw = String(env.PAYMENTS_PROVIDER ?? 'mercado_pago').trim().toLowerCase()
  if (raw === 'mock' || raw === 'mercado_pago') return raw
  throw new HttpError(
    503,
    `PAYMENTS_PROVIDER invalido: ${raw}. Usá PAYMENTS_MOCK=true|false o PAYMENTS_PROVIDER=mock|mercado_pago.`,
  )
}

export function assertPaymentsMockAllowed(env = process.env) {
  if (!isPaymentsMockEnvironmentAllowed(env)) {
    throw new HttpError(
      503,
      'PAYMENTS_MOCK=true solo esta permitido en local/dev (no production ni Vercel preview/prod).',
    )
  }
}

export function assertMercadoPagoRuntimeReady(env = process.env) {
  const status = getPaymentsRuntimeStatus(env)
  if (!status.ready) {
    throw new HttpError(
      503,
      `Mercado Pago no puede iniciar cobros: ${status.issues.join(' ')}`,
    )
  }
}

export function getPaymentsRuntimeStatus(env = process.env) {
  const provider = resolvePaymentsProvider(env)
  if (provider === 'mock') {
    return {
      provider,
      ready: isPaymentsMockEnvironmentAllowed(env),
      accessTokenConfigured: false,
      webhookConfigured: false,
      publicKeyConfigured: false,
      webhookProcessingMode: 'mock',
      issues: isPaymentsMockEnvironmentAllowed(env) ? [] : ['El proveedor mock no esta permitido.'],
    }
  }

  const configured = (value) => {
    const normalized = String(value ?? '').trim()
    return Boolean(normalized && !PLACEHOLDER_PATTERN.test(normalized))
  }
  const accessTokenConfigured = configured(env.MERCADO_PAGO_ACCESS_TOKEN)
  const webhookConfigured = configured(env.MERCADO_PAGO_WEBHOOK_SECRET)
  const publicKeyConfigured = configured(env.VITE_MERCADO_PAGO_PUBLIC_KEY)
  const issues = []
  if (!accessTokenConfigured) issues.push('Falta un MERCADO_PAGO_ACCESS_TOKEN valido.')
  if (!webhookConfigured) issues.push('Falta un MERCADO_PAGO_WEBHOOK_SECRET valido.')
  if (!publicKeyConfigured) issues.push('Falta una VITE_MERCADO_PAGO_PUBLIC_KEY valida.')

  return {
    provider,
    ready: issues.length === 0,
    accessTokenConfigured,
    webhookConfigured,
    publicKeyConfigured,
    webhookProcessingMode: PAYMENT_WEBHOOK_DEFER_PROCESSING ? 'deferred' : 'inline',
    issues,
  }
}

/**
 * Factory del proveedor de pagos. Misma interfaz hacia workflows.
 * @returns {ReturnType<typeof createMercadoPagoAdapter> | ReturnType<typeof createMockMercadoPagoAdapter>}
 */
export function createPaymentProviderAdapter({ env = process.env, timeout, store } = {}) {
  const provider = resolvePaymentsProvider(env)

  if (provider === 'mock') {
    assertPaymentsMockAllowed(env)
    if (store) return createMockMercadoPagoAdapter({ store, env })
    if (!sharedMockAdapter) sharedMockAdapter = createMockMercadoPagoAdapter({ env })
    return sharedMockAdapter
  }

  // Fallar antes de mostrar/procesar el checkout evita aceptar dinero cuando
  // la notificacion canonica no podria acreditarse en el dominio.
  assertMercadoPagoRuntimeReady(env)
  return createMercadoPagoAdapter({ env, timeout })
}

/** Solo tests: limpia el singleton mock entre casos. */
export function resetSharedMockPaymentAdapter() {
  sharedMockAdapter = null
}
