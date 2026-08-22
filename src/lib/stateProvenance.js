/**
 * stateProvenance.js — PLU ARG
 *
 * Formato de la procedencia de un estado: quién lo puso, cuándo, y con qué
 * clave se traduce su motivo.
 *
 * Vive separado de los componentes que lo usan por el mismo motivo por el que
 * `paymentProgress.js` está separado: es lógica pura y testeable, y mezclarla
 * con JSX rompe el fast refresh del panel (`react/only-export-components`).
 *
 * No traduce: devuelve claves y parámetros para que la UI los pase por i18n.
 */

/**
 * El actor que guarda la base es `<id>:<email>` -- el id sirve para auditar, el
 * mail es lo único que un operador reconoce al leer la ficha. Se muestra el
 * mail; el id sigue estando en `domain_audit_logs` para la traza.
 */
export function actorLabel(actor) {
  if (!actor) return null
  const raw = String(actor)
  const separator = raw.indexOf(':')
  return separator >= 0 ? raw.slice(separator + 1) : raw
}

/**
 * Fecha y hora al minuto. El vencimiento de un cobro sin la hora no explica
 * nada: "venció el 20 de ago" contra un comprobante de las 19:06 no se puede
 * comparar.
 */
export function formatStateDateTime(value, locale) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    // es-AR sale "04:36 p. m."; el reloj de 24 horas es el que usa el panel y
    // el que hace comparable la hora con la del comprobante de Mercado Pago.
    hour12: locale === 'en',
  })
}

/**
 * Claves i18n del motivo de un cobro, en orden de composición.
 *
 * Devuelve `null` cuando no hay motivo que mostrar, `{ text }` cuando el motivo
 * es texto libre escrito por una persona (no se traduce), y
 * `{ key, params, attemptKey }` cuando sale del catálogo.
 *
 * `attemptKey` existe porque un vencimiento con intentos fallidos detrás son
 * dos datos y no uno: que venció, y por qué no entró ninguno. Es la diferencia
 * entre "no llegó a pagar" y "quiso pagar y la tarjeta lo rechazó", que es lo
 * primero que pregunta el atleta.
 */
export function resolvePaymentReasonKeys(progress, { namespace, locale } = {}) {
  if (!progress) return null
  if (progress.reasonText) return { text: progress.reasonText }
  if (!progress.reasonCode) return null

  return {
    key: `${namespace}.reason.${progress.reasonCode}`,
    params: { date: formatStateDateTime(progress.expiredAt, locale) ?? '—' },
    attemptKey: progress.attemptReasonCode
      ? `${namespace}.attempt.${progress.attemptReasonCode}`
      : null,
  }
}
