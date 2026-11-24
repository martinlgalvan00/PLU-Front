import {
  ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE,
  ATHLETE_DOCUMENT_PDF_MAX_BYTES,
  ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_UNREADABLE_MESSAGE,
  ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES,
} from '../../shared/athleteDocuments.js'

export { ATHLETE_DOCUMENT_PDF_MAX_BYTES, ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES }

/** Lado largo máximo del retrato. 512 cubre avatares 2x (~84–128 CSS px) sin sobrar. */
export const ATHLETE_PHOTO_MAX_EDGE = 512
export const ATHLETE_PHOTO_WEBP_QUALITY = 0.65
/** Si ya es WebP chico, no re-procesamos. */
const SKIP_IF_ALREADY_UNDER_BYTES = 80 * 1024
/** Tope duro post-compresión: si queda más grande, bajamos calidad otra pasada. */
export const ATHLETE_PHOTO_TARGET_MAX_BYTES = 100 * 1024

/** Comprobantes: legibles en panel, sin mandar 5 MB por transferencia. */
export const PAYMENT_PROOF_MAX_EDGE = 1600
export const PAYMENT_PROOF_WEBP_QUALITY = 0.72
export const PAYMENT_PROOF_TARGET_MAX_BYTES = 400 * 1024

/** Catálogo de tienda: portadas nítidas en card/detalle, Storage liviano. */
export const SHOP_PRODUCT_MAX_EDGE = 1200
export const SHOP_PRODUCT_WEBP_QUALITY = 0.7
export const SHOP_PRODUCT_TARGET_MAX_BYTES = 280 * 1024

/**
 * Legajo (DNI / certificado): el texto tiene que leerse, el archivo no.
 * 1024 px y ~80 KB cubren un DNI en el panel sin acercarse al tope de 400 KB.
 */
export const ATHLETE_DOCUMENT_MAX_EDGE = 1024
export const ATHLETE_DOCUMENT_WEBP_QUALITY = 0.4
export const ATHLETE_DOCUMENT_TARGET_MAX_BYTES = 80 * 1024
/**
 * Si la primera pasada no entra en ~80 KB, se achica el lado largo.
 * El tope de Storage (400 KB) se controla después, por si ninguna pasada llega.
 */
const ATHLETE_DOCUMENT_EDGE_FALLBACKS = [
  { maxEdge: 800, quality: 0.32, qualityPasses: [0.24] },
  { maxEdge: 640, quality: 0.24, qualityPasses: [0.18] },
  { maxEdge: 512, quality: 0.2, qualityPasses: [0.16] },
]
const STORED_DOCUMENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function fitImageWithin(width, height, maxEdge = ATHLETE_PHOTO_MAX_EDGE) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const longest = Math.max(safeWidth, safeHeight)
  if (longest <= maxEdge) return { width: safeWidth, height: safeHeight }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  }
}

function replaceExtension(fileName, extension) {
  const base = String(fileName ?? 'foto')
    .trim()
    .replace(/\.[^.]+$/, '')
  return `${base || 'foto'}.${extension}`
}

async function canvasToBlob(canvas, mimeType, quality) {
  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), mimeType, quality)
  })
  if (blob) return { blob, type: mimeType }
  const jpeg = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', quality)
  })
  if (!jpeg) return { blob: null, type: mimeType }
  return { blob: jpeg, type: 'image/jpeg' }
}

async function rasterizeImage(bitmap, { maxEdge, mimeType, quality, qualityPasses, targetMaxBytes }) {
  const { width, height } = fitImageWithin(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, width, height)

  const first = await canvasToBlob(canvas, mimeType, quality)
  if (!first.blob || first.blob.size === 0) return null

  let bestBlob = first.blob
  let bestType = first.type
  if (bestBlob.size > targetMaxBytes && mimeType === 'image/webp') {
    for (const passQuality of qualityPasses) {
      const pass = await canvasToBlob(canvas, mimeType, passQuality)
      if (pass.blob && pass.blob.size > 0 && pass.blob.size < bestBlob.size) {
        bestBlob = pass.blob
        bestType = pass.type
      }
      if (bestBlob.size <= targetMaxBytes) break
    }
  }
  return { blob: bestBlob, type: bestType }
}

function fileFromEncoded(file, encoded) {
  const extension = encoded.type === 'image/jpeg' ? 'jpg' : 'webp'
  return new File([encoded.blob], replaceExtension(file.name, extension), {
    type: encoded.type,
    lastModified: Date.now(),
  })
}

/**
 * Achica y pasa a WebP antes de subir a Storage. Si el entorno no puede
 * rasterizar (tests, Safari viejo) o el resultado no es más liviano, se
 * queda el archivo original.
 * `hardMaxBytes` + `edgeFallbacks` solo los usa el legajo: si la primera
 * pasada no entra en el tope, achica el lado largo. Retrato, comprobantes
 * y tienda no los pasan.
 */
export async function compressImageFile(
  file,
  {
    maxEdge = ATHLETE_PHOTO_MAX_EDGE,
    quality = ATHLETE_PHOTO_WEBP_QUALITY,
    mimeType = 'image/webp',
    targetMaxBytes = ATHLETE_PHOTO_TARGET_MAX_BYTES,
    skipUnderBytes = SKIP_IF_ALREADY_UNDER_BYTES,
    qualityPasses = [0.55, 0.45],
    hardMaxBytes = null,
    edgeFallbacks = [],
  } = {},
) {
  if (!file?.type?.startsWith('image/')) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const alreadySmallEnough =
      file.type === mimeType &&
      bitmap.width <= maxEdge &&
      bitmap.height <= maxEdge &&
      file.size <= skipUnderBytes
    if (alreadySmallEnough) return file

    const passes = [{ maxEdge, quality, qualityPasses }]
    if (hardMaxBytes != null) {
      for (const fallback of edgeFallbacks) passes.push(fallback)
    }

    let best = null
    for (const pass of passes) {
      const encoded = await rasterizeImage(bitmap, {
        maxEdge: pass.maxEdge,
        mimeType,
        quality: pass.quality,
        qualityPasses: pass.qualityPasses ?? [],
        targetMaxBytes,
      })
      if (encoded && (!best || encoded.blob.size < best.blob.size)) best = encoded
      if (hardMaxBytes == null) break
      if (best && best.blob.size <= hardMaxBytes) break
    }

    if (!best || best.blob.size === 0 || best.blob.size >= file.size) return file
    return fileFromEncoded(file, best)
  } finally {
    bitmap.close?.()
  }
}

/** Comprobante de transferencia: achica JPG/PNG/WebP; PDF se deja igual. */
export async function compressPaymentProofFile(file) {
  if (!file?.type?.startsWith('image/')) return file
  return compressImageFile(file, {
    maxEdge: PAYMENT_PROOF_MAX_EDGE,
    quality: PAYMENT_PROOF_WEBP_QUALITY,
    targetMaxBytes: PAYMENT_PROOF_TARGET_MAX_BYTES,
    skipUnderBytes: PAYMENT_PROOF_TARGET_MAX_BYTES,
  })
}

/** Foto de producto de tienda: WebP ≤ ~280 KB, lado largo ≤ 1200. */
export async function compressShopProductImage(file) {
  if (!file?.type?.startsWith('image/')) return file
  return compressImageFile(file, {
    maxEdge: SHOP_PRODUCT_MAX_EDGE,
    quality: SHOP_PRODUCT_WEBP_QUALITY,
    targetMaxBytes: SHOP_PRODUCT_TARGET_MAX_BYTES,
    skipUnderBytes: SHOP_PRODUCT_TARGET_MAX_BYTES,
  })
}

function isHeicLike(file) {
  const type = String(file?.type ?? '').toLowerCase()
  const name = String(file?.name ?? '')
  return type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(name)
}

function throwDocumentError(message, code) {
  const error = new Error(message)
  error.code = code
  throw error
}

/**
 * DNI / certificado: achica la foto hasta ~80 KB (tope duro 400 KB).
 * Si el navegador no puede abrir un HEIC, pide un JPG.
 * Un PDF que entra en el tope se deja; uno más pesado se rechaza.
 */
export async function compressAthleteDocumentFile(file) {
  if (file?.type === 'application/pdf') {
    if (file.size > ATHLETE_DOCUMENT_PDF_MAX_BYTES) {
      throwDocumentError(ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE, 'DOCUMENT_PDF_TOO_LARGE')
    }
    return file
  }
  if (!file?.type?.startsWith('image/')) return file

  const prepared = await compressImageFile(file, {
    maxEdge: ATHLETE_DOCUMENT_MAX_EDGE,
    quality: ATHLETE_DOCUMENT_WEBP_QUALITY,
    targetMaxBytes: ATHLETE_DOCUMENT_TARGET_MAX_BYTES,
    skipUnderBytes: ATHLETE_DOCUMENT_TARGET_MAX_BYTES,
    qualityPasses: [0.32, 0.24],
    hardMaxBytes: ATHLETE_DOCUMENT_TARGET_MAX_BYTES,
    edgeFallbacks: ATHLETE_DOCUMENT_EDGE_FALLBACKS,
  })

  if (
    STORED_DOCUMENT_IMAGE_TYPES.has(prepared.type) &&
    prepared.size <= ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES
  ) {
    return prepared
  }
  if (isHeicLike(file)) {
    throwDocumentError(ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE, 'DOCUMENT_HEIC_UNSUPPORTED')
  }
  if (!STORED_DOCUMENT_IMAGE_TYPES.has(prepared.type)) {
    throwDocumentError(ATHLETE_DOCUMENT_UNREADABLE_MESSAGE, 'DOCUMENT_UNREADABLE')
  }
  throwDocumentError(ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE, 'DOCUMENT_STILL_TOO_LARGE')
}
