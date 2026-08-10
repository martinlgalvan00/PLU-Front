import { apiGet, apiPatch, apiPost, apiRequest } from '../lib/api.js'

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

export function mapPricingConfiguration(payload = {}) {
  return {
    plans: (payload.plans ?? []).map(mapMembershipPlan),
    events: (payload.events ?? []).map((event) => ({
      ...event,
      registrationPrice: Number(event.registrationPrice) || 0,
      comboOffer: event.comboOffer
        ? { ...event.comboOffer, price: Number(event.comboOffer.price) || 0 }
        : null,
    })),
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
