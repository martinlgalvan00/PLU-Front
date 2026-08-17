import { apiDelete, apiGet, apiPatch, apiPost, apiRequest } from '../lib/api.js'

function dateTimeToIso(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function mapMembershipPlan(row) {
  return {
    id: row.id,
    code: row.code,
    familyCode: row.family_code ?? row.familyCode ?? row.code,
    version: Number(row.version) || 1,
    name: row.name,
    description: row.description ?? '',
    price: Number(row.price) || 0,
    manualPrice: row.manual_price != null ? Number(row.manual_price) : (row.manualPrice ?? null),
    currency: row.currency ?? 'ARS',
    billingFrequency: row.billing_frequency ?? row.billingFrequency ?? 'annual',
    collectionMode: row.collection_mode ?? row.collectionMode ?? 'one_time',
    intervalCount: Number(row.interval_count ?? row.intervalCount) || 1,
    graceDays: Number(row.grace_days ?? row.graceDays) || 0,
    providerPlanId: row.provider_plan_id ?? row.providerPlanId ?? null,
    active: row.active !== false,
    effectiveFrom: row.effective_from ?? row.effectiveFrom ?? null,
    retiredAt: row.retired_at ?? row.retiredAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

export function mapDiscountCode(row) {
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? '',
    percentOff: Number(row.percent_off ?? row.percentOff) || 0,
    appliesTo: row.applies_to ?? row.appliesTo ?? 'membership',
    maxRedemptions: row.max_redemptions ?? row.maxRedemptions ?? null,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    active: row.active !== false,
    enablesManualPayment: Boolean(row.enables_manual_payment ?? row.enablesManualPayment ?? false),
    redeemedCount: Number(row.redeemed_count ?? row.redeemedCount) || 0,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

/**
 * Proyección operativa de un cupón para el panel. El conteo definitivo vive
 * en Postgres y se actualiza al crear la orden; este helper sólo traduce esa
 * respuesta canónica a estados legibles, sin intentar reservar usos en React.
 */
export function getDiscountCodeAvailability(code = {}, now = new Date()) {
  const maxRedemptions = Number(code.maxRedemptions)
  const hasLimit = Number.isInteger(maxRedemptions) && maxRedemptions > 0
  const redeemedCount = Math.max(0, Number(code.redeemedCount) || 0)
  const remaining = hasLimit ? Math.max(0, maxRedemptions - redeemedCount) : null
  const exhausted = hasLimit && remaining === 0
  const expired = Boolean(code.expiresAt) && new Date(code.expiresAt) < now

  let status = 'active'
  // El cupón se desactiva automáticamente al llegar al límite. Se prioriza
  // "agotado" por encima de "inactivo" para explicarle al operador qué pasó.
  if (exhausted) status = 'exhausted'
  else if (code.active === false) status = 'inactive'
  else if (expired) status = 'expired'

  return {
    hasLimit,
    maxRedemptions: hasLimit ? maxRedemptions : null,
    redeemedCount,
    remaining,
    exhausted,
    progress: hasLimit ? Math.min(100, (redeemedCount / maxRedemptions) * 100) : 0,
    status,
  }
}

export function mapPricingConfiguration(payload = {}) {
  return {
    plans: (payload.plans ?? []).map(mapMembershipPlan),
    events: (payload.events ?? []).map((event) => ({
      ...event,
      registrationPrice: Number(event.registrationPrice) || 0,
      registrationManualPrice: event.registrationManualPrice != null
        ? Number(event.registrationManualPrice)
        : null,
      comboOffer: event.comboOffer
        ? {
            ...event.comboOffer,
            price: Number(event.comboOffer.price) || 0,
            manualPrice: event.comboOffer.manualPrice != null
              ? Number(event.comboOffer.manualPrice)
              : null,
          }
        : null,
    })),
    discountCodes: (payload.discountCodes ?? []).map(mapDiscountCode),
    availability: payload.availability ?? { editable: true, reason: null },
  }
}

export async function fetchPricingConfigurationRequest() {
  return mapPricingConfiguration(await apiGet('/api/pricing'))
}

export async function createMembershipPlanVersionRequest(plan) {
  const result = await apiPost('/api/pricing/membership-plans/versions', {
    ...plan,
    effectiveFrom: dateTimeToIso(plan.effectiveFrom),
  })
  return mapMembershipPlan(result.plan)
}

export async function setMembershipPlanActiveRequest(planId, active) {
  const result = await apiPatch(
    `/api/pricing/membership-plans/${encodeURIComponent(planId)}/status`,
    { active },
  )
  return mapMembershipPlan(result.plan)
}

export async function deleteMembershipPlanRequest(planId) {
  return apiDelete(`/api/pricing/membership-plans/${encodeURIComponent(planId)}`)
}

export async function saveEventComboOfferRequest(eventSlug, offer) {
  return apiRequest(`/api/pricing/events/${encodeURIComponent(eventSlug)}/combo`, {
    method: 'PUT',
    body: JSON.stringify({
      ...offer,
      startsAt: dateTimeToIso(offer.startsAt),
      endsAt: dateTimeToIso(offer.endsAt),
    }),
  })
}

export async function setMembershipPlanRetirementRequest(planId, retiresAt) {
  const result = await apiPatch(
    `/api/pricing/membership-plans/${encodeURIComponent(planId)}/retirement`,
    { retiresAt: dateTimeToIso(retiresAt) },
  )
  return mapMembershipPlan(result.plan)
}

export async function upsertDiscountCodeRequest(code) {
  const result = await apiPost('/api/pricing/discount-codes', {
    ...code,
    expiresAt: dateTimeToIso(code.expiresAt),
  })
  return mapDiscountCode(result.code)
}

export async function setDiscountCodeActiveRequest(codeId, active) {
  const result = await apiPatch(
    `/api/pricing/discount-codes/${encodeURIComponent(codeId)}/status`,
    { active },
  )
  return mapDiscountCode(result.code)
}

export async function deleteDiscountCodeRequest(codeId) {
  return apiDelete(`/api/pricing/discount-codes/${encodeURIComponent(codeId)}`)
}

export async function fetchBillingSubscriptionsRequest(filters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.athleteId) params.set('athleteId', filters.athleteId)
  const query = params.toString()
  const result = await apiGet(`/api/payments/subscriptions${query ? `?${query}` : ''}`)
  return result.subscriptions ?? []
}

export async function cancelBillingSubscriptionRequest(subscriptionId) {
  const result = await apiPost(`/api/payments/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {})
  return result.subscription
}
