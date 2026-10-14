import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'

export async function fetchPaymentProfiles({
  kind = 'bank_transfer',
  includeArchived = false,
  includeUsage = false,
} = {}) {
  const params = new URLSearchParams()
  if (kind) params.set('kind', kind)
  if (includeArchived) params.set('includeArchived', 'true')
  if (includeUsage) params.set('includeUsage', 'true')
  const query = params.toString()
  const result = await apiGet(`/api/payment-profiles${query ? `?${query}` : ''}`)
  return {
    profiles: Array.isArray(result?.profiles) ? result.profiles : [],
    secretsKeyConfigured: result?.secretsKeyConfigured === true,
    // Botón "Conectar con Mercado Pago": solo si la app de MP está configurada
    // en el servidor. Sin el campo (backend viejo) se asume que no.
    mercadoPagoOAuth: {
      available: result?.mercadoPagoOAuth?.available === true,
      missing: Array.isArray(result?.mercadoPagoOAuth?.missing)
        ? result.mercadoPagoOAuth.missing
        : [],
    },
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

/** Baja definitiva; el servidor responde 409 PAYMENT_PROFILE_IN_USE si hay que archivar. */
export async function deletePaymentProfile(profileId) {
  return apiDelete(`/api/payment-profiles/${encodeURIComponent(profileId)}`)
}

/** Renovación manual del token de una cuenta vinculada por OAuth. */
export async function refreshMercadoPagoProfile(profileId) {
  return apiPost(`/api/payment-profiles/${encodeURIComponent(profileId)}/refresh`, {})
}

/**
 * URL de autorización de Mercado Pago. `profileId` reconecta una cuenta que ya
 * existe; sin él se vincula una nueva.
 */
export async function startMercadoPagoOAuth({ profileId = null, name = '' } = {}) {
  const body = {}
  if (profileId) body.profileId = profileId
  if (name.trim()) body.name = name.trim()
  const result = await apiPost('/api/payment-profiles/mercado-pago/oauth/start', body)
  if (!result?.authorizationUrl) throw new Error('Mercado Pago no devolvió la URL de autorización.')
  return result.authorizationUrl
}
