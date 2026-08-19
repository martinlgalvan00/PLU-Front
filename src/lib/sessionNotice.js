const SIGNED_OUT_STORAGE_KEY = 'plu-signed-out'
const SIGNED_IN_STORAGE_KEY = 'plu-signed-in'
const SIGNED_OUT_EVENT = 'plu:session-signed-out'
const SIGNED_IN_EVENT = 'plu:session-signed-in'

/**
 * Marca el cierre de sesión para que el toast sobreviva el cambio de layout
 * privado → público. El nombre viaja para que el aviso sea de la persona que
 * salió, no un genérico — con sesiones admin/athlete simultáneas en el mismo
 * navegador, el "Cerraste sesión" anonimo no decía quién había salido.
 *
 * Limpia el flag de login: si quedó uno sin consumir (el login no siempre
 * llega a montar SessionNotice a tiempo para leerlo, ver markSignedIn), un
 * logout real no debería dejarlo resucitar como bienvenida más tarde.
 */
export function markSignedOut(displayName = '') {
  try {
    window.sessionStorage.removeItem(SIGNED_IN_STORAGE_KEY)
    window.sessionStorage.setItem(
      SIGNED_OUT_STORAGE_KEY,
      JSON.stringify({ name: String(displayName ?? '').trim() }),
    )
  } catch {
    // Modo privado o storage bloqueado: el evento cubre el mismo tab.
  }
  window.dispatchEvent(
    new CustomEvent(SIGNED_OUT_EVENT, { detail: { name: String(displayName ?? '').trim() } }),
  )
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

export { SIGNED_OUT_EVENT, SIGNED_IN_EVENT }

/**
 * Marca el login con el mismo esquema flag+evento que markSignedOut (antes
 * solo disparaba el evento). `setSession` en useAppData.login desmonta el
 * SessionNotice público y monta el privado antes de que este código siga
 * corriendo, así que el CustomEvent se despacha sin nadie escuchando todavía
 * y la bienvenida se perdía — o peor, el mount nuevo levantaba un flag de
 * "Hasta pronto" viejo sin consumir de un logout anterior y lo mostraba como
 * si fuera el resultado del login recién hecho. El flag en sessionStorage
 * cubre ese remount igual que ya hacía el de logout.
 */
export function markSignedIn(displayName = '') {
  try {
    window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY)
    window.sessionStorage.setItem(
      SIGNED_IN_STORAGE_KEY,
      JSON.stringify({ name: String(displayName ?? '').trim() }),
    )
  } catch {
    // Modo privado o storage bloqueado: el evento cubre el mismo tab.
  }
  window.dispatchEvent(
    new CustomEvent(SIGNED_IN_EVENT, { detail: { name: String(displayName ?? '').trim() } }),
  )
}

/** Devuelve `{ name }` si hay un login pendiente de mostrar, o `false`. */
export function consumeSignedInFlag() {
  try {
    const raw = window.sessionStorage.getItem(SIGNED_IN_STORAGE_KEY)
    if (raw === null) return false
    window.sessionStorage.removeItem(SIGNED_IN_STORAGE_KEY)
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
