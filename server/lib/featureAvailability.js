import { HttpError } from './errors.js'

export const FEATURE_COMING_SOON = 'FEATURE_COMING_SOON'

/** Catálogo mínimo de features gated por APP_PRODUCTION. */
export const FEATURE_KEYS = Object.freeze({
  recurringMembership: 'recurringMembership',
  pricingWrites: 'pricingWrites',
  comboCheckout: 'comboCheckout',
})

export function isEnabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

export function isAppProduction(env = process.env) {
  return isEnabledFlag(env?.APP_PRODUCTION)
}

/**
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 */
export function isFeatureEnabled(featureKey, env = process.env) {
  const production = isAppProduction(env)
  switch (featureKey) {
    case FEATURE_KEYS.recurringMembership:
      return !production
    case FEATURE_KEYS.pricingWrites:
      return !production
    case FEATURE_KEYS.comboCheckout:
      // Combo se habilita por oferta en DB (ventana/active), no por APP_PRODUCTION.
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
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 * @returns {{ enabled: boolean, reason: 'production_coming_soon' | null }}
 */
export function getFeatureAvailability(featureKey, env = process.env) {
  const enabled = isFeatureEnabled(featureKey, env)
  return {
    enabled,
    reason: enabled ? null : 'production_coming_soon',
  }
}

export function isRecurringMembershipPlan(plan) {
  return (plan?.collection_mode ?? plan?.collectionMode) === 'recurring'
}

export function filterPublicMembershipPlans(plans, env = process.env) {
  const rows = Array.isArray(plans) ? plans : []
  return isFeatureEnabled(FEATURE_KEYS.recurringMembership, env)
    ? rows
    : rows.filter((plan) => !isRecurringMembershipPlan(plan))
}

export function assertFeatureAvailable(env, message) {
  if (!isAppProduction(env)) return
  throw new HttpError(409, message, { code: FEATURE_COMING_SOON })
}

/** El checkout combo se habilita por oferta en DB (ventana/active), no por APP_PRODUCTION. */
export function assertComboCheckoutAvailable(_env) {}

export function assertRecurringMembershipAvailable(env) {
  if (isFeatureEnabled(FEATURE_KEYS.recurringMembership, env)) return
  throw new HttpError(
    409,
    'La afiliación con débito automático está disponible próximamente en producción.',
    { code: FEATURE_COMING_SOON },
  )
}

export function assertPricingWritesEnabled(env = process.env) {
  if (isFeatureEnabled(FEATURE_KEYS.pricingWrites, env)) return
  throw new HttpError(
    409,
    'La configuración económica está disponible próximamente en producción.',
    { code: FEATURE_COMING_SOON },
  )
}
