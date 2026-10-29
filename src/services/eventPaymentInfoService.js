import { apiGet } from '../lib/api.js'
import { registerMemoryCache } from '../lib/memoryCaches.js'

/**
 * Cómo se paga la inscripción de un evento (bloque "Cómo pagar" de la
 * landing): medios abiertos y lugar del efectivo. Un minuto de caché por
 * evento: el bloque se monta en la landing y en la vista previa del editor.
 */
const CACHE_MS = 60_000
const cache = new Map()

export function invalidateEventPaymentInfo() {
  cache.clear()
}

registerMemoryCache(invalidateEventPaymentInfo)

export function fetchEventPaymentInfo(eventSlug) {
  const slug = String(eventSlug ?? '').trim()
  if (!slug) return Promise.resolve(null)
  const hit = cache.get(slug)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise
  const promise = apiGet(`/api/athletes/public/events/${encodeURIComponent(slug)}/payment-info`)
  cache.set(slug, { at: Date.now(), promise })
  promise.catch(() => cache.delete(slug))
  return promise
}
