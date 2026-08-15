const SIGNED_OUT_STORAGE_KEY = 'plu-signed-out'
const SIGNED_OUT_EVENT = 'plu:session-signed-out'

/**
 * Marca el cierre de sesión para que el toast sobreviva el cambio de layout
 * privado → público. El nombre viaja para que el aviso sea de la persona que
 * salió, no un genérico — con sesiones admin/athlete simultáneas en el mismo
 * navegador, el "Cerraste sesión" anonimo no decía quién había salido.
 */
export function markSignedOut(displayName = '') {
  try {
    window.sessionStorage.setItem(
      SIGNED_OUT_STORAGE_KEY,
      JSON.stringify({ name: String(displayName ?? '').trim() }),
    )
  } catch {
    // Modo privado o storage bloqueado: el evento cubre el mismo tab.
  }
  window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail: { name: String(displayName ?? '').trim() } }))
}

/**
 * Devuelve `{ name }` si hay un cierre pendiente de mostrar, o `false`.
 * Retrocompatible con el flag legacy `'1'` (sin nombre).
 */
export function consumeSignedOutFlag() {
  try {
    const raw = window.sessionStorage.getItem(SIGNED_OUT_STORAGE_KEY)
    if (raw === null) return false
    window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY)
    if (raw === '1') return { name: '' }
    try {
      const parsed = JSON.parse(raw)
      return { name: typeof parsed?.name === 'string' ? parsed.name : '' }
    } catch {
      return { name: '' }
    }
  } catch {
    return false
  }
}

export { SIGNED_OUT_EVENT }

export const SIGNED_IN_EVENT = 'plu:session-signed-in'

export function markSignedIn(displayName = '') {
  window.dispatchEvent(new CustomEvent(SIGNED_IN_EVENT, { detail: { name: String(displayName ?? '').trim() } }))
}
