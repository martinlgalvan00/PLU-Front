import QRCode from 'qrcode'

/**
 * credentialQr.js — PLU ARG
 *
 * Genera el QR de verificación que va impreso en la card de inscripción/afiliación.
 * Apunta a la home con un query param (no un path propio) para que funcione en
 * cualquier hosting está sin depender de reglas de rewrite/SPA fallback del server.
 */

/**
 * Arma la URL pública de verificación de una credencial.
 * @param {{ code: string, eventSlug?: string, type?: 'ticket' }} params
 *   type: 'ticket' distingue una entrada general (busca en tickets) de una
 *   credencial de socio/atleta (busca en membresías) — mismo código de
 *   verificación, colección distinta.
 * @returns {string}
 */
export function buildCredentialUrl({ code, eventSlug, type }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://plu-arg.com'
  const url = new URL(origin)
  url.searchParams.set('credencial', code)
  if (eventSlug) url.searchParams.set('evento', eventSlug)
  if (type) url.searchParams.set('tipo', type)
  return url.toString()
}

/**
 * Genera el PNG (data URL) del QR para una credencial.
 * @param {string} url
 * @returns {Promise<string>}
 */
export function generateCredentialQr(url) {
  return QRCode.toDataURL(url, {
    width: 320,
    margin: 1,
    color: {
      dark: '#0d0e11',
      light: '#ffffff',
    },
  })
}

/**
 * Lee los params de verificación desde la URL actual (si los hay).
 * @returns {{ code: string, eventSlug: string | null, type: string | null } | null}
 */
export function readCredentialParams() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const code = params.get('credencial')
  if (!code) return null
  return { code, eventSlug: params.get('evento'), type: params.get('tipo') }
}
