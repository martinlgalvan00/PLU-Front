import { apiGet, apiPatch, apiPost } from '../lib/api.js'

export async function fetchPaymentProfiles({ kind = 'bank_transfer' } = {}) {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const result = await apiGet(`/api/payment-profiles${query}`)
  return {
    profiles: Array.isArray(result?.profiles) ? result.profiles : [],
    secretsKeyConfigured: result?.secretsKeyConfigured === true,
  }
}

export async function createPaymentProfile({ name, kind = 'bank_transfer', config, secrets }) {
  const body = { name, kind, config }
  if (secrets) body.secrets = secrets
  const result = await apiPost('/api/payment-profiles', body)
  return result?.profile ?? null
}

export async function updatePaymentProfile(profileId, patch) {
  const result = await apiPatch(`/api/payment-profiles/${encodeURIComponent(profileId)}`, patch)
  return result?.profile ?? null
}
