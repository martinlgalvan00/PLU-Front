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

/**
 * Achica y pasa a WebP antes de subir a Storage. Si el entorno no puede
 * rasterizar (tests, Safari viejo) o el resultado no es más liviano, se
 * queda el archivo original.
 */
export async function compressImageFile(
  file,
  {
    maxEdge = ATHLETE_PHOTO_MAX_EDGE,
    quality = ATHLETE_PHOTO_WEBP_QUALITY,
    mimeType = 'image/webp',
    targetMaxBytes = ATHLETE_PHOTO_TARGET_MAX_BYTES,
    skipUnderBytes = SKIP_IF_ALREADY_UNDER_BYTES,
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

  const alreadySmallEnough =
    file.type === mimeType &&
    bitmap.width <= maxEdge &&
    bitmap.height <= maxEdge &&
    file.size <= skipUnderBytes
  if (alreadySmallEnough) {
    bitmap.close?.()
    return file
  }

  const { width, height } = fitImageWithin(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close?.()
    return file
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const { blob, type } = await canvasToBlob(canvas, mimeType, quality)
  if (!blob || blob.size === 0 || blob.size >= file.size) return file

  let bestBlob = blob
  let bestType = type
  if (bestBlob.size > targetMaxBytes && mimeType === 'image/webp') {
    for (const passQuality of [0.55, 0.45]) {
      const pass = await canvasToBlob(canvas, mimeType, passQuality)
      if (pass.blob && pass.blob.size > 0 && pass.blob.size < bestBlob.size) {
        bestBlob = pass.blob
        bestType = pass.type
      }
      if (bestBlob.size <= targetMaxBytes) break
    }
  }

  const extension = bestType === 'image/jpeg' ? 'jpg' : 'webp'
  return new File([bestBlob], replaceExtension(file.name, extension), {
    type: bestType,
    lastModified: Date.now(),
  })
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
