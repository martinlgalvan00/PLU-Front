import { apiPost } from '../lib/api.js'

/**
 * Registra un email para aviso de apertura de cobros/inscripciones.
 * @param {{ email: string, source?: string, eventSlug?: string | null }} payload
 */
export async function registerLaunchInterest(payload) {
  return apiPost('/api/launch-interest', {
    email: payload.email,
    source: payload.source ?? 'launch_teaser',
    eventSlug: payload.eventSlug ?? null,
  })
}
