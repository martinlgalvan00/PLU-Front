import { env as appEnv } from '../config/env.js'

export const FEATURE_COMING_SOON = 'FEATURE_COMING_SOON'

/** Catálogo mínimo — espejo de `server/lib/featureAvailability.js`. */
export const FEATURE_KEYS = Object.freeze({
  recurringMembership: 'recurringMembership',
  pricingWrites: 'pricingWrites',
  comboCheckout: 'comboCheckout',
  paidCheckout: 'paidCheckout',
})

export function isEnabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

function isDisabledFlag(value) {
  return ['false', '0', 'no'].includes(String(value ?? '').trim().toLowerCase())
}

/**
 * Acepta `env.appProduction` (cliente) o `APP_PRODUCTION` (tests / process-like).
 * @param {{ appProduction?: boolean, APP_PRODUCTION?: string } | null | undefined} [envLike]
 */
export function isAppProduction(envLike = appEnv) {
  if (typeof envLike?.appProduction === 'boolean') return envLike.appProduction
  return isEnabledFlag(envLike?.APP_PRODUCTION)
}

/**
 * Tri-state: true/false fuerza; null = sin override.
 * @param {Record<string, unknown> | null | undefined} [envLike]
 * @returns {boolean | null}
 */
export function resolvePaidCheckoutOverride(envLike = appEnv) {
  const raw = envLike?.paidCheckoutEnabled ?? envLike?.PAID_CHECKOUT_ENABLED
  if (typeof raw === 'boolean') return raw
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  if (isEnabledFlag(raw)) return true
  if (isDisabledFlag(raw)) return false
  return null
}

export function resolvePaymentsMockFlag(envLike = appEnv) {
  if (typeof envLike?.payments?.mockEnabled === 'boolean') return envLike.payments.mockEnabled
  if (typeof envLike?.paymentsMock === 'boolean') return envLike.paymentsMock
  const raw = envLike?.PAYMENTS_MOCK
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  if (isEnabledFlag(raw)) return true
  if (isDisabledFlag(raw)) return false
  return null
}

/**
 * @deprecated La fecha de apertura vive en el evento (admin: registrationOpensAt).
 * Se mantiene por compatibilidad de tests/imports; ya no abre el gate.
 * @param {Record<string, unknown> | null | undefined} [envLike]
 * @returns {string | null}
 */
export function resolvePaidCheckoutOpensAt(envLike = appEnv) {
  const raw = envLike?.paidCheckoutOpensAt ?? envLike?.PAID_CHECKOUT_OPENS_AT
  const value = String(raw ?? '').trim()
  return value || null
}

/**
 * Gate sync: kill switch + entorno.
 * En producción, sin override, queda cerrado. `registrationOpensAt` no abre cobros.
 *
 * @param {Record<string, unknown> | null | undefined} [envLike]
 * @param {Date} [_now]
 * @param {{ registrationOpensAt?: string | null }} [_options]
 */
export function isPaidCheckoutEnabled(envLike = appEnv, _now = new Date(), _options = {}) {
  const override = resolvePaidCheckoutOverride(envLike)
  if (override !== null) return override
<<<<<<< HEAD
=======

  if (isAppProduction(envLike) && resolvePaymentsMockFlag(envLike) === false) return false

>>>>>>> 222d289e1238417840e7c9da58edfce6e82f324c
  if (!isAppProduction(envLike)) return true
  return false
}

/**
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {Record<string, unknown> | null | undefined} [envLike]
 * @param {Date} [now]
 */
export function isFeatureEnabled(featureKey, envLike = appEnv, now = new Date()) {
  const production = isAppProduction(envLike)
  switch (featureKey) {
    case FEATURE_KEYS.recurringMembership:
      return !production
    case FEATURE_KEYS.pricingWrites:
      return !production
    case FEATURE_KEYS.comboCheckout:
      return isPaidCheckoutEnabled(envLike, now)
    case FEATURE_KEYS.paidCheckout:
      return isPaidCheckoutEnabled(envLike, now)
    default: {
      const _exhaustive = featureKey
      void _exhaustive
      return !production
    }
  }
}

/**
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {Record<string, unknown> | null | undefined} [envLike]
 * @param {Date} [now]
 * @returns {{ enabled: boolean, reason: 'production_coming_soon' | null }}
 */
export function getFeatureAvailability(featureKey, envLike = appEnv, now = new Date()) {
  const enabled = isFeatureEnabled(featureKey, envLike, now)
  return {
    enabled,
    reason: enabled ? null : 'production_coming_soon',
  }
}

export function isRecurringMembershipPlan(plan) {
  return (plan?.collection_mode ?? plan?.collectionMode) === 'recurring'
}

/**
 * @param {unknown[]} plans
 * @param {Record<string, unknown> | null | undefined} [envLike]
 */
export function filterPublicMembershipPlans(plans, envLike = appEnv) {
  const rows = Array.isArray(plans) ? plans : []
  return isFeatureEnabled(FEATURE_KEYS.recurringMembership, envLike)
    ? rows
    : rows.filter((plan) => !isRecurringMembershipPlan(plan))
}
