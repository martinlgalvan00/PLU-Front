/**
 * One-shot flag for the credential merge ritual after membership activates.
 * Keyed by athlete + membership so renewals can play again.
 */
const STORAGE_PREFIX = 'plu.credentialMerge.'

export function credentialMergeStorageKey(athleteId, membershipId) {
  return `${STORAGE_PREFIX}${athleteId}.${membershipId}`
}

export function hasPlayedCredentialMerge(athleteId, membershipId) {
  if (typeof window === 'undefined' || !athleteId || !membershipId) return true
  try {
    return window.localStorage.getItem(credentialMergeStorageKey(athleteId, membershipId)) === '1'
  } catch {
    return true
  }
}

export function markCredentialMergePlayed(athleteId, membershipId) {
  if (typeof window === 'undefined' || !athleteId || !membershipId) return
  try {
    window.localStorage.setItem(credentialMergeStorageKey(athleteId, membershipId), '1')
  } catch {
    // Quota / private mode: skip persistence; worst case the ritual replays.
  }
}
