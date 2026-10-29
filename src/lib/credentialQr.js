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
function loadQrCode() {
  // qrcode pesa ~60 KB y solo se necesita al generar (credencial/share):
  // dynamic import para que readCredentialParams/parseCredentialScan no lo
  // arrastren al chunk inicial vía App.jsx o el scanner.
  return import('qrcode').then((module) => module.default ?? module)
}

function renderPlainQr(url) {
  return loadQrCode().then((QRCode) =>
    QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0d0e11',
        light: '#ffffff',
      },
    }),
  )
}

/**
 * Última red: SVG, sin canvas ni logo. `toDataURL` y el QR de marca usan
 * canvas; en algunos celulares ese canvas no existe o el isotipo no carga, y
 * la entrada quedaba con el ícono vacío. Un SVG escanea igual en la puerta.
 */
function renderVectorQr(url) {
  return loadQrCode().then((QRCode) =>
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0d0e11', light: '#ffffff' },
    }).then((svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
  )
}

const BRANDED_QR_TIMEOUT_MS = 1600
const QR_RENDER_PX = 512
const QR_SEAL_PX = 256

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('qr-timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

let stylingLibraryPromise = null
let sealPromise = null
let brandedRenderer = null
let renderQueue = Promise.resolve()

function loadQrCodeStyling() {
  stylingLibraryPromise ??= import('qr-code-styling').then((module) => module.default ?? module)
  return stylingLibraryPromise
}

/**
 * El emblema se aplana una sola vez sobre un disco blanco. Sin eso, cada
 * credencial volvía a decodificar el PNG y los módulos transparentes del
 * borde se mezclaban con el código.
 * @returns {Promise<string>}
 */
function loadQrSeal() {
  if (sealPromise) return sealPromise
  if (typeof document === 'undefined') return Promise.reject(new Error('qr-seal'))

  sealPromise = new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = QR_SEAL_PX
        canvas.height = QR_SEAL_PX
        const context = canvas.getContext('2d')
        if (!context) throw new Error('qr-seal')
        context.clearRect(0, 0, QR_SEAL_PX, QR_SEAL_PX)
        context.fillStyle = '#ffffff'
        context.beginPath()
        context.arc(QR_SEAL_PX / 2, QR_SEAL_PX / 2, QR_SEAL_PX / 2, 0, Math.PI * 2)
        context.fill()
        const inset = 18
        context.drawImage(image, inset, inset, QR_SEAL_PX - inset * 2, QR_SEAL_PX - inset * 2)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error('qr-seal'))
    image.src = BRAND.qrLogoUrl
  }).catch((error) => {
    sealPromise = null
    throw error
  })

  return sealPromise
}

function enqueueRender(task) {
  const run = renderQueue.then(task, task)
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
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
 * Un solo renderer, en fila: varias credenciales en la misma pantalla no
 * arman varios canvas a la vez.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function renderBrandedQr(url) {
  const [QRCodeStyling, seal] = await Promise.all([loadQrCodeStyling(), loadQrSeal()])

  if (!brandedRenderer) {
    brandedRenderer = new QRCodeStyling({
      width: QR_RENDER_PX,
      height: QR_RENDER_PX,
      type: 'canvas',
      data: url,
      margin: 16,
      qrOptions: { errorCorrectionLevel: 'H' },
      image: seal,
      imageOptions: {
        crossOrigin: 'anonymous',
        hideBackgroundDots: true,
        imageSize: 0.2,
        margin: 8,
      },
      dotsOptions: { type: 'rounded', color: '#0d0e11' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#0d0e11' },
      cornersDotOptions: { type: 'dot', color: '#0d0e11' },
      backgroundOptions: { color: '#ffffff' },
    })
  } else {
    brandedRenderer.update({ data: url })
  }

  const blob = await brandedRenderer.getRawData('png')
  if (!blob) throw new Error('No se pudo generar el QR estilizado.')
  return blobToDataUrl(blob)
}

/**
 * Genera el PNG (data URL) del QR para una credencial, con el tratamiento de
 * marca PLU en todas las superficies: credencial del atleta, entradas,
 * cards para compartir, panel admin y seguridad.
 *
 * Antes convivían dos generadores —uno plano para casi todo y uno de marca
 * solo para el panel—: la misma persona veía dos QR distintos según por dónde
 * entrara. Ahora hay uno solo. Si la marca no llega (canvas, isotipo o
 * tiempo), queda el PNG plano y, si tampoco hay canvas, un SVG. Un QR que
 * escanea gana contra uno de marca que a veces no existe.
 *
 * Cachea por URL para no re-encodear cuando preview + capture montan
 * dos EventShareCard en el mismo flujo de share (pico CPU en mobile).
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
const QR_CACHE_MAX_ENTRIES = 24
const qrDataUrlCache = new Map()

function rememberQr(url, pending) {
  // Map conserva orden de inserción: al volver a usar una entrada la movemos
  // al final y descartamos primero la menos reciente. Cada valor es un PNG en
  // data URL; sin límite, una sesión larga de acreditación crecía para siempre.
  qrDataUrlCache.delete(url)
  qrDataUrlCache.set(url, pending)
  while (qrDataUrlCache.size > QR_CACHE_MAX_ENTRIES) {
    const oldestUrl = qrDataUrlCache.keys().next().value
    qrDataUrlCache.delete(oldestUrl)
  }
}

export function generateCredentialQr(url) {
  const cached = qrDataUrlCache.get(url)
  if (cached) {
    rememberQr(url, cached)
    return cached
  }

  // Marca primero, con techo de tiempo: si el isotipo o el canvas no responden,
  // no dejamos la puerta esperando. PNG plano y, si tampoco hay canvas, SVG.
  // El techo corre dentro de la fila, no mientras se espera turno.
  const pending = enqueueRender(() =>
    withTimeout(renderBrandedQr(url), BRANDED_QR_TIMEOUT_MS)
      .catch(() => renderPlainQr(url))
      .catch(() => renderVectorQr(url))
      .catch((error) => {
        qrDataUrlCache.delete(url)
        throw error
      }),
  )

  rememberQr(url, pending)
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
