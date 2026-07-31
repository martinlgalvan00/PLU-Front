/**
 * emailService.js — PLU ARG
 *
 * Los emails transaccionales se disparan y se registran **en el servidor**
 * (`server/modules/notifications/`). El frontend no elige templates ni habla
 * con Brevo.
 *
 * Antes este archivo resolvía el `templateId` desde variables `VITE_BREVO_*` y
 * guardaba los envíos en un array en memoria. Eso tenía tres problemas:
 * exponía la configuración de templates al browser, el "log" se perdía al
 * recargar la página, y los emails de aprobación manual de un pago no
 * quedaban en `transactional_email_logs` (a diferencia de los del webhook de
 * Mercado Pago, que sí). Hoy la aprobación manual notifica desde
 * `POST /api/athletes/admin/payment-orders/:orderId/approve`.
 *
 * Lo que queda acá es el disparo manual desde el panel admin (avisos
 * operativos, anuncios de evento), que pega contra `/api/emails/send`.
 */

import { apiGet, apiPost } from '../lib/api.js'

/**
 * Disparo manual de un email del catálogo. El backend valida el tipo, resuelve
 * el template y decide si usa el de Brevo o el fallback HTML del repo.
 *
 * @param {string} type Clave del catálogo (`server/modules/notifications/emailCatalog.js`).
 * @param {{ to: string, params?: Record<string, unknown>, subject?: string }} payload
 */
export function sendTransactionalEmail(type, { to, params = {}, subject } = {}) {
  return apiPost('/api/emails/send', { type, to, params, subject })
}

/**
 * Aviso de evento a una audiencia (`registered`, `members`, `all_athletes`).
 * @param {{ eventId: string, audience?: string, type?: string, campaignKey?: string,
 *   subject?: string, summary?: string, notes?: string }} payload
 */
export function notifyEventAudience(payload) {
  return apiPost('/api/emails/events/notify', payload)
}

/** Auditoría de envíos para el panel admin. */
export function getEmailLogs(filters = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  ).toString()
  return apiGet(`/api/emails/logs${query ? `?${query}` : ''}`)
}

/**
 * Estado de configuración por tipo: qué sale por template de Brevo y qué por
 * el fallback HTML. Sirve para ver de un vistazo qué falta cargar en el
 * dashboard.
 */
export function getEmailCatalog() {
  return apiGet('/api/emails/catalog')
}

export function suppressEmail({ email, reason, detail }) {
  return apiPost('/api/emails/suppressions', { email, reason, detail })
}
