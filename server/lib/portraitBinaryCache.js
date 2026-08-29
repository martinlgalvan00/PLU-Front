import { etagMatches, weakEtagFromParts } from './http.js'
import {
  ATHLETE_PHOTO_BUCKET,
  AUTH_PORTRAIT_CACHE_CONTROL,
  PUBLIC_PORTRAIT_CACHE_CONTROL,
  readStorageBody,
} from './publicPortraitUrl.js'

/**
 * Cache de binarios de retrato en la instancia del proceso.
 *
 * Cada `storage.download()` cuenta como egress de Supabase. El path de la
 * foto incluye timestamp (`athleteId/Date.now()-nombre`), así que cuando
 * cambia la foto cambia la clave y no hace falta invalidar a mano salvo
 * al borrar el path anterior.
 *
 * Límites chicos a propósito: Functions tienen poca RAM; esto es un
 * amortiguador para el poll del panel y el spotlight, no un CDN.
 */
const MAX_ENTRIES = 64
const MAX_TOTAL_BYTES = 10 * 1024 * 1024

const binaryCache = new Map()
let totalBytes = 0

/** Visibilidad pública de un path: evita 2–3 queries a cada hit caliente. */
const visibilityCache = new Map()
const VISIBILITY_TTL_MS = 5 * 60 * 1000
const VISIBILITY_MAX = 400

export function portraitEtag(path) {
  return weakEtagFromParts('athlete-portrait', path)
}

function touchBinary(path, entry) {
  binaryCache.delete(path)
  binaryCache.set(path, entry)
}

function evictBinaryIfNeeded(incomingBytes) {
  while (
    binaryCache.size > 0 &&
    (binaryCache.size >= MAX_ENTRIES || totalBytes + incomingBytes > MAX_TOTAL_BYTES)
  ) {
    const oldestKey = binaryCache.keys().next().value
    const oldest = binaryCache.get(oldestKey)
    binaryCache.delete(oldestKey)
    totalBytes -= oldest?.bytes ?? 0
  }
}

export function getCachedPortraitBinary(path) {
  const entry = binaryCache.get(path)
  if (!entry) return null
  touchBinary(path, entry)
  return entry
}

export function setCachedPortraitBinary(path, { body, contentType }) {
  const bytes = body?.byteLength ?? body?.length ?? 0
  if (!body || bytes <= 0 || bytes > MAX_TOTAL_BYTES) return
  evictBinaryIfNeeded(bytes)
  if (binaryCache.has(path)) {
    totalBytes -= binaryCache.get(path).bytes ?? 0
    binaryCache.delete(path)
  }
  const entry = { body, contentType: contentType || 'image/webp', bytes }
  binaryCache.set(path, entry)
  totalBytes += bytes
}

export function forgetPortraitCache(path) {
  if (!path) return
  const entry = binaryCache.get(path)
  if (entry) {
    totalBytes -= entry.bytes ?? 0
    binaryCache.delete(path)
  }
  visibilityCache.delete(path)
}

export function getCachedPublicVisibility(path) {
  const entry = visibilityCache.get(path)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    visibilityCache.delete(path)
    return null
  }
  return entry.allowed
}

export function setCachedPublicVisibility(path, allowed) {
  if (visibilityCache.size >= VISIBILITY_MAX) {
    const oldestKey = visibilityCache.keys().next().value
    visibilityCache.delete(oldestKey)
  }
  visibilityCache.set(path, {
    allowed: Boolean(allowed),
    expiresAt: Date.now() + VISIBILITY_TTL_MS,
  })
}

/**
 * Sirve un retrato desde LRU o Storage. Con If-None-Match correcto no toca
 * Storage ni manda body (304).
 *
 * @returns {'etag'|'memory'|'storage'|'missing'}
 */
export async function sendPortraitBinary({
  req,
  res,
  client,
  path,
  cacheControl,
  bucket = ATHLETE_PHOTO_BUCKET,
}) {
  const etag = portraitEtag(path)
  res.set('ETag', etag)
  res.set('Cache-Control', cacheControl)
  if (String(cacheControl).includes('public')) {
    // Sin Vary: Cookie — si no, el CDN no comparte el objeto entre visitantes.
    res.set('Vary', 'Accept-Encoding')
  }

  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.status(304).end()
    return 'etag'
  }

  const cached = getCachedPortraitBinary(path)
  if (cached) {
    res.set('Content-Type', cached.contentType)
    res.set('X-Portrait-Cache', 'memory')
    res.send(cached.body)
    return 'memory'
  }

  const downloaded = await client.storage.from(bucket).download(path)
  if (downloaded.error || !downloaded.data) {
    res.status(404).end()
    return 'missing'
  }

  const body = await readStorageBody(downloaded.data)
  const contentType = downloaded.data.type || 'image/webp'
  setCachedPortraitBinary(path, { body, contentType })

  res.set('Content-Type', contentType)
  res.set('X-Portrait-Cache', 'storage')
  res.send(body)
  return 'storage'
}

export { AUTH_PORTRAIT_CACHE_CONTROL, PUBLIC_PORTRAIT_CACHE_CONTROL }
