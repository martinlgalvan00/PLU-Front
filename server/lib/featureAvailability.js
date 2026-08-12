import { HttpError } from './errors.js'

export const FEATURE_COMING_SOON = 'FEATURE_COMING_SOON'

export function isEnabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

export function isAppProduction(env = process.env) {
  return isEnabledFlag(env?.APP_PRODUCTION)
}

export function isRecurringMembershipPlan(plan) {
  return (plan?.collection_mode ?? plan?.collectionMode) === 'recurring'
}

export function filterPublicMembershipPlans(plans, env = process.env) {
  const rows = Array.isArray(plans) ? plans : []
  return isAppProduction(env)
    ? rows.filter((plan) => !isRecurringMembershipPlan(plan))
    : rows
}

export function assertFeatureAvailable(env, message) {
  if (!isAppProduction(env)) return
  throw new HttpError(409, message, { code: FEATURE_COMING_SOON })
}

/** El checkout combo se habilita por oferta en DB (ventana/active), no por APP_PRODUCTION. */
export function assertComboCheckoutAvailable(_env) {}

export function assertRecurringMembershipAvailable(env) {
  assertFeatureAvailable(
    env,
    'La afiliación con débito automático está disponible próximamente en producción.',
  )
}
