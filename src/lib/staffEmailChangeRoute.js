/**
 * Deep link de confirmación de cambio de email de staff:
 * `/?cambio-email=<token>`.
 *
 * Mismo patrón que `passwordResetRoute.js`. Se usa un parámetro propio (y no
 * `reset`) para que el token no pueda caer por accidente en el flujo de reset
 * de contraseña de atletas, que espera otro `typ` de firma.
 */

export function readStaffEmailChangeToken(
  search = typeof window !== 'undefined' ? window.location.search : '',
) {
  try {
    const params = new URLSearchParams(search)
    return params.get('cambio-email')?.trim() || null
  } catch {
    return null
  }
}

export function clearStaffEmailChangeToken() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('cambio-email')) return
  url.searchParams.delete('cambio-email')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

export function buildStaffEmailChangeUrl(appUrl, token) {
  const base = String(appUrl ?? '').replace(/\/$/, '')
  return `${base}/?cambio-email=${encodeURIComponent(token)}`
}
