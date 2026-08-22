import { apiPost } from '../lib/api.js'

/**
 * Envía el formulario de Contacto. El backend lo reenvía por email a la
 * bandeja de PLU con reply-to del remitente — no queda guardado en ningún
 * otro lado.
 * @param {{ name: string, email: string, message: string, motive: string }} payload
 */
export async function submitContactMessage(payload) {
  return apiPost('/api/contact', {
    name: payload.name,
    email: payload.email,
    message: payload.message,
    motive: payload.motive,
  })
}
