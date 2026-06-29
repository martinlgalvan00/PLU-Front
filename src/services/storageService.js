import { STORAGE_KEY } from '../lib/constants.js'
import { normalizeStoredData } from '../lib/storage.js'

const LEGACY_STORAGE_KEY = 'maximal-plu-arg-demo'

export function readStorage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!saved) return null
    return normalizeStoredData(JSON.parse(saved))
  } catch {
    return null
  }
}

export function writeStorage(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function clearStorage() {
  window.localStorage.removeItem(STORAGE_KEY)
}
