/** Lado largo máximo del retrato. 720 cubre avatares 2x sin mandar el original de 2 MB. */
export const ATHLETE_PHOTO_MAX_EDGE = 720
export const ATHLETE_PHOTO_WEBP_QUALITY = 0.72
const SKIP_IF_ALREADY_UNDER_BYTES = 120 * 1024

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
    file.size <= SKIP_IF_ALREADY_UNDER_BYTES
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

  const extension = type === 'image/jpeg' ? 'jpg' : 'webp'
  return new File([blob], replaceExtension(file.name, extension), {
    type,
    lastModified: Date.now(),
  })
}
