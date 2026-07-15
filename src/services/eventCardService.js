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

/**
 * Captura un elemento DOM como PNG usando html2canvas.
 * @param {HTMLElement} element — el nodo a capturar
 * @param {{ scale?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function generateEventCard(element, options = {}) {
  if (!element) throw new Error('eventCardService: elemento no encontrado.')

  const html2canvas = (await import('html2canvas')).default

  const canvas = await html2canvas(element, {
    scale: options.scale ?? 2,
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
