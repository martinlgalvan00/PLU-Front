import { apiGet, apiRequest } from '../lib/api.js'

function mapToggles(result) {
  return {
    checkoutEnabled: result?.checkoutEnabled !== false,
    membershipEnabled: result?.membershipEnabled !== false,
    registrationEnabled: result?.registrationEnabled !== false,
    updatedBy: result?.updatedBy ?? null,
    updatedAt: result?.updatedAt ?? null,
  }
}

export async function fetchPlatformFeatureToggles() {
  return mapToggles(await apiGet('/api/platform-settings'))
}

export async function savePlatformFeatureToggle(feature, enabled) {
  const result = await apiRequest('/api/platform-settings', {
    method: 'PUT',
    body: JSON.stringify({ feature, enabled }),
  })
  return mapToggles(result)
}
