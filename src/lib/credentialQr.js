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
 * URL canónica de la credencial de una persona.
 *
 * El QR del atleta no representa una afiliación ni una inscripción puntual:
 * identifica a la persona con `athletes.credential_token`. Los derechos se
 * resuelven frescos al escanear. Por eso esta URL nunca lleva `evento`; así la
 * misma imagen sigue sirviendo después de afiliarse, inscribirse o renovar.
 * Las entradas generales no usan este helper: conservan tipo + evento.
 *
 * @param {string} code
 * @returns {string}
 */
export function buildAthleteCredentialUrl(code) {
  return buildCredentialUrl({ code })
}

/**
 * Genera el PNG (data URL) del QR para una credencial.
 * Cachea por URL para no re-encodear cuando preview + capture montan
 * dos EventShareCard en el mismo flujo de share (pico CPU en mobile).
 * @param {string} url
 * @returns {Promise<string>}
 */
const qrDataUrlCache = new Map()

export function generateCredentialQr(url) {
  const cached = qrDataUrlCache.get(url)
  if (cached) return cached

  // qrcode pesa ~60 KB y solo se necesita al generar (credencial/share):
  // dynamic import para que readCredentialParams/parseCredentialScan no lo
  // arrastren al chunk inicial vía App.jsx o el scanner.
  const pending = import('qrcode')
    .then((module) => {
      const QRCode = module.default ?? module
      return QRCode.toDataURL(url, {
        width: 320,
        margin: 1,
        color: {
          dark: '#0d0e11',
          light: '#ffffff',
        },
      })
    })
    .catch((error) => {
      qrDataUrlCache.delete(url)
      throw error
    })

  qrDataUrlCache.set(url, pending)
  return pending
}

/**
 * Detecta códigos de vista previa / showcase (no verificables en backend).
 * Prefijo PREV- usado por Members, Home, Storybook y TicketPassPreview.
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function isPreviewCredentialCode(code) {
  if (!code || typeof code !== 'string') return false
  return code.trim().toUpperCase().startsWith('PREV-')
}

/**
 * Código preview aleatorio por visita (Members showcase / easter egg).
 * @param {string} [prefix='PREV-MEMBERS']
 * @returns {string}
 */
export function buildRandomPreviewCredentialCode(prefix = 'PREV-MEMBERS') {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  const id = entropy.slice(0, 8).toUpperCase()
  return `${prefix}-${id}`
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

/**
 * Interpreta el texto crudo de un escaneo QR o pegado manual.
 * Acepta URL completa con query params o solo el código/token.
 * @param {string} raw
 * @returns {{ code: string, eventSlug: string | null, type: string | null } | null}
 */
export function parseCredentialScan(raw) {
  const value = raw?.trim()
  if (!value) return null

  try {
    const url = value.includes('://') ? new URL(value) : new URL(value, 'https://plu-arg.com')
    const code = url.searchParams.get('credencial')
    if (code) {
      return {
        code,
        eventSlug: url.searchParams.get('evento'),
        type: url.searchParams.get('tipo'),
      }
    }
  } catch {
    // No era una URL — seguimos con el valor plano.
  }

  return { code: value, eventSlug: null, type: null }
}
