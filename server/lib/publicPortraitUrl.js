/**
 * Retratos de atletas.
 *
 * URLs estables (sin token firmado): el browser y el CDN pueden cachear el
 * binario. Las URLs firmadas de Storage rotan el query y obligan a re-bajar
 * el original — eso es lo que dispara el egress con pocos MB en el bucket.
 */

export function isSafeStoragePhotoPath(path) {
  const value = String(path ?? '').trim()
  if (!value || value.length > 300) return false
  if (value.includes('..') || value.includes('\\') || value.startsWith('/')) return false
  const parts = value.split('/')
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
}

/** Retrato ya exhibido en público (spotlight, recientes, etc.). */
export function publicPortraitUrl(photoPath) {
  if (!isSafeStoragePhotoPath(photoPath)) return null
  return `/api/community/portrait?p=${encodeURIComponent(photoPath)}`
}

/**
 * Retrato autenticado (cuenta del atleta + panel). Misma forma estable; el
 * endpoint exige cookie de sesión (atleta dueño o staff con permiso).
 */
export function authenticatedPortraitUrl(photoPath) {
  if (!isSafeStoragePhotoPath(photoPath)) return null
  return `/api/athletes/portrait?p=${encodeURIComponent(photoPath)}`
}

export const PUBLIC_PORTRAIT_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800, immutable'

/** Cache de browser para fotos del panel/cuenta: sin CDN compartido. */
export const AUTH_PORTRAIT_CACHE_CONTROL =
  'private, max-age=86400, stale-while-revalidate=604800'

export const ATHLETE_PHOTO_BUCKET = 'athlete-photos'

export async function readStorageBody(data) {
  if (!data) return Buffer.alloc(0)
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return Buffer.from(data)
  if (typeof data.arrayBuffer === 'function') {
    return Buffer.from(await data.arrayBuffer())
  }
  return Buffer.from(data)
}
