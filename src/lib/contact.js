/**
 * Email institucional de contacto (bandeja pública + mailto).
 * Fuente de verdad del frontend; el backend usa CONTACT_NOTIFY_EMAIL con el mismo default.
 */
export const CONTACT_EMAIL = 'Maximalstrengthcorp@gmail.com'

/**
 * Arma un `mailto:` que abre el cliente de correo del dispositivo
 * (Mail, Outlook, Hotmail, Gmail app, etc.).
 *
 * @param {{ subject?: string, body?: string, email?: string }} [options]
 * @returns {string}
 */
export function buildMailtoHref({ subject = '', body = '', email = CONTACT_EMAIL } = {}) {
  const parts = []
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`)
  if (body) parts.push(`body=${encodeURIComponent(body)}`)
  return parts.length ? `mailto:${email}?${parts.join('&')}` : `mailto:${email}`
}
