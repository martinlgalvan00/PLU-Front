const SIGNED_OUT_STORAGE_KEY = 'plu-signed-out'
const SIGNED_OUT_EVENT = 'plu:session-signed-out'

export function markSignedOut() {
  try {
    window.sessionStorage.setItem(SIGNED_OUT_STORAGE_KEY, '1')
  } catch {
    // Modo privado o storage bloqueado: el evento cubre el mismo tab.
  }
  window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT))
}

export function consumeSignedOutFlag() {
  try {
    if (window.sessionStorage.getItem(SIGNED_OUT_STORAGE_KEY) !== '1') return false
    window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export { SIGNED_OUT_EVENT }
