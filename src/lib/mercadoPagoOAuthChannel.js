/**
 * Canal entre la ventana de vinculación con Mercado Pago y el panel que la
 * abrió.
 *
 * No sirve `window.opener.postMessage`: el sitio sale con
 * `Cross-Origin-Opener-Policy: same-origin` (vercel.json), así que cuando la
 * ventana navega a mercadopago.com y vuelve, el vínculo con el opener queda
 * cortado (y `popup.closed` del lado del panel deja de ser confiable). Un
 * `BroadcastChannel` del mismo origen no depende de ese vínculo; `localStorage`
 * queda como respaldo para navegadores sin BroadcastChannel.
 */

export const MERCADO_PAGO_OAUTH_CHANNEL = 'plu:mercado-pago-oauth'
const STORAGE_KEY = 'plu:mercado-pago-oauth:result'

/** La ventana de resultado avisa al panel. */
export function publishMercadoPagoOAuthResult(result) {
  const message = { ...result, at: Date.now() }
  try {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(MERCADO_PAGO_OAUTH_CHANNEL)
      channel.postMessage(message)
      channel.close()
    }
  } catch {
    // Sin canal: queda el respaldo de storage.
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage bloqueado (modo privado estricto): el panel igual recarga al volver el foco.
  }
}

/** El panel escucha el resultado. Devuelve la función para dejar de escuchar. */
export function subscribeMercadoPagoOAuthResult(onResult) {
  let channel = null
  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(MERCADO_PAGO_OAUTH_CHANNEL)
      channel.onmessage = (event) => onResult(event.data)
    }
  } catch {
    channel = null
  }
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      onResult(JSON.parse(event.newValue))
    } catch {
      // Valor ajeno o corrupto: se ignora.
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.close()
  }
}

/** Lee el resultado que el servidor dejó en la URL de la pantalla de vuelta. */
export function readMercadoPagoOAuthLanding(search = window.location.search) {
  const params = new URLSearchParams(search)
  return {
    status: params.get('status') || 'error',
    code: params.get('code') || null,
    profileId: params.get('profileId') || null,
    created: params.get('created') === '1',
  }
}
