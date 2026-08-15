/**
 * eventCardService.js — PLU ARG
 *
 * Genera y descarga la card de inscripción como imagen PNG.
 * Todo el procesamiento ocurre en el browser (sin backend).
 *
 * Uso:
 *   import { generateEventCard, downloadCard, shareCard } from './eventCardService.js'
 *   const blob = await generateEventCard(elementRef.current)
 *   downloadCard(blob, 'mi-card-plu.png')
 */

/** Instagram canónico: 1080×1080 / 1080×1920. Scale 1 alcanza; scale 2
 *  cuadruplica píxeles (caro en mobile). */
const CAPTURE_SCALE_DESKTOP = 2
const CAPTURE_SCALE_MOBILE = 1

/**
 * Scale de captura: mobile/touch usa 1 (tamaño canónico IG, menos memoria);
 * desktop fine-pointer usa 2 para descargas más nítidas.
 * @param {number} [explicit]
 * @returns {number}
 */
export function resolveCaptureScale(explicit) {
  if (typeof explicit === 'number' && explicit > 0) return explicit
  if (typeof window === 'undefined') return CAPTURE_SCALE_DESKTOP

  const coarse =
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  const narrow = window.matchMedia('(max-width: 719px)').matches

  return coarse || narrow ? CAPTURE_SCALE_MOBILE : CAPTURE_SCALE_DESKTOP
}

/** Precarga el chunk de html2canvas (p. ej. al abrir el modal). */
export function preloadEventCardCapture() {
  return import('html2canvas')
}

/**
 * Descarga una imagen remota y la devuelve como data: URL.
 *
 * La foto de perfil vive en Storage bajo una URL firmada de otro origen.
 * html2canvas corre con `allowTaint: false`, así que una imagen cross-origin
 * sin cabeceras CORS no se rasteriza: el `<img>` se ve perfecto en el preview
 * y sale VACÍO en el PNG descargado. Con el retrato como material principal
 * de la card, eso es la diferencia entre una pieza y un rectángulo negro.
 *
 * Inlinear a data: URL elimina el problema de raíz — para el canvas la imagen
 * pasa a ser same-origin. Si la descarga falla (sin CORS, 404, timeout), se
 * devuelve null y la card cae al sello de iniciales, que siempre rasteriza.
 *
 * @param {string|null|undefined} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<string|null>}
 */
export async function inlineImageAsDataUrl(url, { timeoutMs = 6000 } = {}) {
  if (!url) return null
  if (url.startsWith('data:')) return url

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) return null

    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null

    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Deja que el browser pinte el spinner antes del trabajo pesado de raster. */
function yieldToMain() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

/**
 * Captura un elemento DOM como PNG usando html2canvas.
 * @param {HTMLElement} element — el nodo a capturar
 * @param {{ scale?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function generateEventCard(element, options = {}) {
  if (!element) throw new Error('eventCardService: elemento no encontrado.')

  await yieldToMain()

  const html2canvas = (await import('html2canvas')).default
  const scale = resolveCaptureScale(options.scale)

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    // La card es un cuadrado opaco (no un recorte) — un canvas transparente
    // produce un PNG con el canal alfa en 0 (imagen en blanco al abrirla).
    backgroundColor: '#0d0e11',
    logging: false,
    // Forzamos el tamaño exacto de la card
    width: element.offsetWidth,
    height: element.offsetHeight,
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('eventCardService: no se pudo generar el blob.'))
      },
      'image/png',
      1.0,
    )
  })
}

/**
 * Descarga un Blob como archivo PNG.
 * @param {Blob} blob
 * @param {string} [filename]
 */
export function downloadCard(blob, filename = 'plu-arg-card.png') {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Liberar memoria en el siguiente tick
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Comparte el Blob via Web Share API (mobile).
 * Si el browser no soporta la API, cae en descarga directa.
 * @param {Blob} blob
 * @param {string} [text] — mensaje del share (ya trae el @pluarg armado por
 *   buildShareText en CardPreviewModal); es lo que Instagram/WhatsApp
 *   efectivamente muestran, no el `title` (la mayoría de las apps lo ignoran).
 * @param {string} [filename]
 * @returns {Promise<boolean>} — true si se usó la Share API
 */
export async function shareCard(blob, text = 'Mi inscripción PLU ARG @pluarg', filename = 'plu-arg-card.png') {
  const file = new File([blob], filename, { type: 'image/png' })
  const canShare =
    typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })

  if (canShare) {
    await navigator.share({
      title: 'PLU ARG',
      text,
      files: [file],
    })
    return true
  }

  // Fallback: descarga directa
  downloadCard(blob, filename)
  return false
}

/**
 * Genera un nombre de archivo sanitizado para la card.
 * @param {string} athleteName
 * @param {string} eventSlug
 * @param {string} [suffix] \u2014 ej. 'historia' para distinguir el formato 9:16
 * @returns {string}
 */
export function buildCardFilename(athleteName = '', eventSlug = '', suffix = '') {
  const safeName = athleteName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)

  const safeSlug = eventSlug.slice(0, 20)
  const safeSuffix = suffix ? `-${suffix}` : ''
  return `plu-arg-${safeName}-${safeSlug}${safeSuffix}.png`
}
