import { apiGet, apiPost } from '../lib/api.js'

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

/**
 * Obtiene el recuento de interesados por fuente. Solo Admin.
 */
export async function getLaunchInterestSummary() {
  return apiGet('/api/launch-interest/summary')
}

/**
 * Envia notificaciones a todos los interesados de una fuente que no hayan sido notificados. Solo Admin.
 * @param {string} source
 */
export async function notifyLaunchInterestSource(source) {
  return apiPost('/api/launch-interest/notify', { source })
}
