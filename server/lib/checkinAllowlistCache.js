import { etagMatches, weakEtagFromParts } from './http.js'

/**
 * Decide si la lista de puerta se puede contestar con 304.
 * Sin revisión (la migración todavía no corrió, o el evento no existe)
 * no hay ETag: se baja el JSON completo, como antes.
 */
export function checkinAllowlistCache(eventSlug, revision, ifNoneMatch) {
  if (revision == null || revision === '') return { etag: null, notModified: false }
  const etag = weakEtagFromParts('checkin-allowlist', eventSlug, revision)
  return {
    etag,
    notModified: etagMatches(ifNoneMatch, etag),
  }
}
