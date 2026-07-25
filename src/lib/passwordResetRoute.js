/**
 * Deep link de reset: `/?reset=<token>` abre LoginPage en modo reset.
 */

export function readPasswordResetToken(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const params = new URLSearchParams(search)
    return params.get('reset')?.trim() || null
  } catch {
    return null
  }
}

export function clearPasswordResetToken() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('reset')) return
  url.searchParams.delete('reset')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

export function buildPasswordResetUrl(appUrl, token) {
  const base = String(appUrl ?? '').replace(/\/$/, '')
  return `${base}/?reset=${encodeURIComponent(token)}`
}
