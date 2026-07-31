/**
 * Deep link de verificación: `/?verificar=<token>`.
 *
 * Mismo mecanismo de query param que `passwordResetRoute.js`, para no sumar
 * una ruta nueva al matcher del App por un flujo de un solo paso.
 */

export function readEmailVerificationToken(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const params = new URLSearchParams(search)
    return params.get('verificar')?.trim() || null
  } catch {
    return null
  }
}

export function clearEmailVerificationToken() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('verificar')) return
  url.searchParams.delete('verificar')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

export function buildEmailVerificationUrl(appUrl, token) {
  const base = String(appUrl ?? '').replace(/\/$/, '')
  return `${base}/?verificar=${encodeURIComponent(token)}`
}
