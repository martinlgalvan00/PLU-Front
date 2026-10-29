import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'
import { registerMemoryCache } from '../lib/memoryCaches.js'

/**
 * Cuentas de cobro compartidas entre pantallas. El editor del evento se vuelve
 * a montar al guardar y al cambiar de pestaña, y en cada montaje pedía las dos
 * listas (transferencia y Mercado Pago); el alta rápida, otras dos. Un minuto
 * de caché alcanza: cualquier alta, edición o baja la invalida, y las lecturas
 * con uso por evento (panel de cuentas) van siempre frescas.
 */
const PROFILES_CACHE_MS = 60_000
const profilesCache = new Map()

/** Descarta el caché de cuentas (alta, edición, baja, vinculación nueva). */
export function invalidatePaymentProfiles() {
  profilesCache.clear()
}

registerMemoryCache(invalidatePaymentProfiles)

export async function fetchPaymentProfiles({
  kind = 'bank_transfer',
  includeArchived = false,
  includeUsage = false,
  fresh = false,
} = {}) {
  const params = new URLSearchParams()
  if (kind) params.set('kind', kind)
  if (includeArchived) params.set('includeArchived', 'true')
  if (includeUsage) params.set('includeUsage', 'true')
  const query = params.toString()
  const cacheable = !includeUsage
  const cached = cacheable && !fresh ? profilesCache.get(query) : null
  if (cached && Date.now() - cached.at < PROFILES_CACHE_MS) return cached.promise
  const promise = readPaymentProfiles(query)
  if (cacheable) {
    profilesCache.set(query, { at: Date.now(), promise })
    // Un error no queda cacheado: el próximo montaje reintenta.
    promise.catch(() => {
      if (profilesCache.get(query)?.promise === promise) profilesCache.delete(query)
    })
  }
  return promise
}

async function readPaymentProfiles(query) {
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
  invalidatePaymentProfiles()
  return result?.profile ?? null
}

export async function updatePaymentProfile(profileId, patch) {
  const result = await apiPatch(`/api/payment-profiles/${encodeURIComponent(profileId)}`, patch)
  invalidatePaymentProfiles()
  return result?.profile ?? null
}

/** Baja definitiva; el servidor responde 409 PAYMENT_PROFILE_IN_USE si hay que archivar. */
export async function deletePaymentProfile(profileId) {
  try {
    return await apiDelete(`/api/payment-profiles/${encodeURIComponent(profileId)}`)
  } finally {
    invalidatePaymentProfiles()
  }
}

/** Renovación manual del token de una cuenta vinculada por OAuth. */
export async function refreshMercadoPagoProfile(profileId) {
  const result = await apiPost(
    `/api/payment-profiles/${encodeURIComponent(profileId)}/refresh`,
    {},
  )
  invalidatePaymentProfiles()
  return result
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
