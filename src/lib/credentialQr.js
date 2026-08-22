/**
 * credentialQr.js — PLU ARG
 *
 * Genera el QR de verificación que va impreso en la card de inscripción/afiliación.
 * Apunta a la home con un query param (no un path propio) para que funcione en
 * cualquier hosting está sin depender de reglas de rewrite/SPA fallback del server.
 */

import { BRAND } from './brand.js'

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
 * Código que va DENTRO del QR de una persona.
 *
 * Existe para que todas las superficies muestren el mismo código: el token de
 * credencial del atleta si lo tiene, el qrToken de la membresía si no, y el
 * número de socio como último recurso. Cuando esta regla vivía duplicada en
 * cada pantalla, la misma persona veía un QR distinto según entrara por su
 * credencial, por "Mi QR" o por la card compartible.
 *
 * @param {{ athlete?: object, membership?: object, latestMembership?: object }} params
 * @returns {string | null}
 */
export function resolveCredentialCode({ athlete, membership, latestMembership } = {}) {
  return (
    athlete?.credentialToken ??
    membership?.qrToken ??
    latestMembership?.qrToken ??
    membership?.memberCode ??
    latestMembership?.memberCode ??
    null
  )
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el QR generado.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * QR plano (módulos cuadrados, sin isotipo). Es el fallback: se usa cuando el
 * tratamiento de marca no puede resolverse en el dispositivo — sin canvas,
 * sin el asset del emblema, o el navegador rechaza `toBlob`. Un QR feo que
 * escanea siempre gana contra uno lindo que a veces no existe.
 * @param {string} url
 * @returns {Promise<string>}
 */
function renderPlainQr(url) {
  // qrcode pesa ~60 KB y solo se necesita al generar (credencial/share):
  // dynamic import para que readCredentialParams/parseCredentialScan no lo
  // arrastren al chunk inicial vía App.jsx o el scanner.
  return import('qrcode').then((module) => {
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
}

/**
 * QR con tratamiento de marca PLU: puntos redondeados, esquinas
 * "extra-rounded" y el isotipo de PLU Argentina al centro.
 *
 * Nivel de corrección de errores 'H' (máximo) porque el isotipo tapa el
 * centro del código: sin eso el logo degrada el escaneo. `hideBackgroundDots`
 * limpia los módulos que quedarían debajo del emblema, así el lector no
 * intenta interpretar píxeles del logo como datos.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
function renderBrandedQr(url) {
  return import('qr-code-styling').then(async (module) => {
    const QRCodeStyling = module.default ?? module
    const qr = new QRCodeStyling({
      width: 320,
      height: 320,
      type: 'canvas',
      data: url,
      margin: 8,
      qrOptions: { errorCorrectionLevel: 'H' },
      image: BRAND.logoArgentinaUrl,
      imageOptions: {
        crossOrigin: 'anonymous',
        hideBackgroundDots: true,
        imageSize: 0.22,
        margin: 4,
      },
      dotsOptions: { type: 'rounded', color: '#0d0e11' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#0d0e11' },
      cornersDotOptions: { type: 'dot', color: '#0d0e11' },
      backgroundOptions: { color: '#ffffff' },
    })
    const blob = await qr.getRawData('png')
    if (!blob) throw new Error('No se pudo generar el QR estilizado.')
    return blobToDataUrl(blob)
  })
}

/**
 * Genera el PNG (data URL) del QR para una credencial, con el tratamiento de
 * marca PLU en todas las superficies: credencial del atleta, entradas,
 * cards para compartir, panel admin y seguridad.
 *
 * Antes convivían dos generadores —uno plano para casi todo y uno de marca
 * solo para el panel—: la misma persona veía dos QR distintos según por dónde
 * entrara. Ahora hay uno solo, y el plano quedó como red de contención
 * (`renderPlainQr`) para que un fallo del tratamiento nunca deje a alguien sin
 * código en la puerta del meet.
 *
 * Cachea por URL para no re-encodear cuando preview + capture montan
 * dos EventShareCard en el mismo flujo de share (pico CPU en mobile).
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
const qrDataUrlCache = new Map()

export function generateCredentialQr(url) {
  const cached = qrDataUrlCache.get(url)
  if (cached) return cached

  const pending = renderBrandedQr(url)
    .catch(() => renderPlainQr(url))
    .catch((error) => {
      qrDataUrlCache.delete(url)
      throw error
    })

  qrDataUrlCache.set(url, pending)
  return pending
}

/**
 * Alias histórico del QR de marca. Se conserva porque el panel admin y sus
 * tests lo importan por nombre; ya no hay diferencia de tratamiento contra
 * `generateCredentialQr`.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export function generateStyledAthleteCredentialQr(url) {
  return generateCredentialQr(url)
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
