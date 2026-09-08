/**
 * Tope y partición de avisos de perfil incompleto.
 * Lo usan UI y API para no desincronizar el lote de 50.
 */

export const PROFILE_NOTICE_KIND = 'profile_incomplete'
export const PROFILE_NOTICE_MESSAGE_MAX = 280
export const PROFILE_NOTICE_BULK_MAX = 50

export function chunkProfileNoticeAthleteIds(athleteIds, max = PROFILE_NOTICE_BULK_MAX) {
  const unique = [...new Set((athleteIds ?? []).filter(Boolean))]
  const chunks = []
  for (let index = 0; index < unique.length; index += max) {
    chunks.push(unique.slice(index, index + max))
  }
  return chunks
}
