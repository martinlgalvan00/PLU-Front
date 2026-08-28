/**
 * Retratos que el sitio ya muestra en público (spotlight y recientes).
 * La URL es estable para que el CDN de Vercel cachee el binario: una URL
 * firmada de Storage cambia el token y el browser vuelve a bajar el original.
 */

export function isSafeStoragePhotoPath(path) {
  const value = String(path ?? '').trim()
  if (!value || value.length > 300) return false
  if (value.includes('..') || value.includes('\\') || value.startsWith('/')) return false
  const parts = value.split('/')
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
}

export function publicPortraitUrl(photoPath) {
  if (!isSafeStoragePhotoPath(photoPath)) return null
  return `/api/community/portrait?p=${encodeURIComponent(photoPath)}`
}

export const PUBLIC_PORTRAIT_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'

export const ATHLETE_PHOTO_BUCKET = 'athlete-photos'
