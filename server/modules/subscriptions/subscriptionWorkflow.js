import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'

function key(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}`
}

function normalizePlan(plan) {
  return {
    id: plan.id,
    code: plan.code,
    familyCode: plan.family_code,
    version: plan.version,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    billingFrequency: plan.billing_frequency,
    collectionMode: plan.collection_mode,
    intervalCount: plan.interval_count,
    graceDays: plan.grace_days,
    effectiveFrom: plan.effective_from,
    providerPlanId: plan.provider_plan_id,
  }
}

function withoutCardToken(providerSubscription) {
  const { card_token_id: _cardToken, token: _token, ...safeSubscription } = providerSubscription
  return safeSubscription
}

export function serializePlan(plan) {
  const normalized = normalizePlan(plan)
  return {
    ...normalized,
    providerPlanId: undefined,
  }
}

async function ensureProviderPlan(planInput, input, { repository, mercadoPago }) {
  let plan = normalizePlan(planInput)
  if (plan.providerPlanId) return plan

  const providerPlan = await mercadoPago.createSubscriptionPlan({
    plan,
    appUrl: input.appUrl,
    idempotencyKey: key('subscription-plan', plan.id),
  })
  const updated = await repository.attachPlanProvider(plan.id, providerPlan)
  return normalizePlan(updated)
}

export async function createEmbeddedRecurringSubscription(input, { repository, mercadoPago }) {
  if (!repository || !mercadoPago) throw new HttpError(503, 'Suscripciones no configuradas.')
  if (!input.cardToken) throw new HttpError(400, 'Falta el token de la tarjeta.')

  const prepared = await repository.prepareSubscription(input)
  const plan = await ensureProviderPlan(prepared.plan, input, { repository, mercadoPago })

  if (prepared.subscription.provider_subscription_id) {
    const providerSubscription = await mercadoPago.getSubscription(
      prepared.subscription.provider_subscription_id,
    )
    const subscription = await repository.applySubscription(providerSubscription)
    return { subscription, created: false }
  }

  const tokenFingerprint = createHash('sha256').update(input.cardToken).digest('hex')
  const claimed = await repository.claimEmbeddedAttempt({
    order: prepared.order,
    tokenFingerprint,
    idempotencyKey: key('embedded-subscription', `${prepared.order.id}:${tokenFingerprint}`),
    operationKind: 'subscription',
  })
  const attempt = claimed.attempt

  if (!claimed.created && attempt.external_payment_id) {
    const providerSubscription = await mercadoPago.getSubscription(attempt.external_payment_id)
    const subscription = await repository.applySubscription(providerSubscription)
    return { subscription, created: false }
  }
  if (!claimed.created) throw new HttpError(409, 'La suscripcion ya se esta procesando.')

  try {
    const providerResponse = await mercadoPago.createSubscription({
      plan,
      payerEmail: prepared.order.payerEmail,
      externalReference: prepared.subscription.external_reference,
      appUrl: input.appUrl,
      idempotencyKey: attempt.idempotency_key,
      cardToken: input.cardToken,
    })
    const providerSubscription = withoutCardToken(providerResponse)
    const subscription = await repository.attachSubscriptionProvider(
      prepared.subscription.id,
      providerSubscription,
    )
    await repository.completeEmbeddedAttempt(attempt.id, {
      status: 'submitted',
      externalPaymentId: providerSubscription.id,
      payload: providerSubscription,
    })
    return { subscription, created: true }
  } catch (error) {
    await repository.completeEmbeddedAttempt(attempt.id, {
      status: 'failed',
      error: error?.message ?? String(error),
    })
    throw error
  }
}
