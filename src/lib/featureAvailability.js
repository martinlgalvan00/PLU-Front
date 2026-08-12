import { env as appEnv } from '../config/env.js'

export const FEATURE_COMING_SOON = 'FEATURE_COMING_SOON'

/** Catálogo mínimo — espejo de `server/lib/featureAvailability.js`. */
export const FEATURE_KEYS = Object.freeze({
  recurringMembership: 'recurringMembership',
  pricingWrites: 'pricingWrites',
  comboCheckout: 'comboCheckout',
})

export function isEnabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
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
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {{ appProduction?: boolean, APP_PRODUCTION?: string } | null | undefined} [envLike]
 */
export function isFeatureEnabled(featureKey, envLike = appEnv) {
  const production = isAppProduction(envLike)
  switch (featureKey) {
    case FEATURE_KEYS.recurringMembership:
      return !production
    case FEATURE_KEYS.pricingWrites:
      return !production
    case FEATURE_KEYS.comboCheckout:
      return true
    default: {
      const _exhaustive = featureKey
      void _exhaustive
      return !production
    }
  }
}

/**
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {{ appProduction?: boolean, APP_PRODUCTION?: string } | null | undefined} [envLike]
 * @returns {{ enabled: boolean, reason: 'production_coming_soon' | null }}
 */
export function getFeatureAvailability(featureKey, envLike = appEnv) {
  const enabled = isFeatureEnabled(featureKey, envLike)
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
 * @param {{ appProduction?: boolean, APP_PRODUCTION?: string } | null | undefined} [envLike]
 */
export function filterPublicMembershipPlans(plans, envLike = appEnv) {
  const rows = Array.isArray(plans) ? plans : []
  return isFeatureEnabled(FEATURE_KEYS.recurringMembership, envLike)
    ? rows
    : rows.filter((plan) => !isRecurringMembershipPlan(plan))
}
