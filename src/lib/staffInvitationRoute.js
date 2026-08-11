export function readStaffInvitationToken(
  search = typeof window !== 'undefined' ? window.location.search : '',
) {
  try {
    const params = new URLSearchParams(search)
    return params.get('invitacion-staff')?.trim() || null
  } catch {
    return null
  }
}

export function clearStaffInvitationToken() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('invitacion-staff')) return
  url.searchParams.delete('invitacion-staff')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export function buildStaffInvitationUrl(appUrl, token) {
  const base = String(appUrl ?? '').replace(/\/$/, '')
  return `${base}/?invitacion-staff=${encodeURIComponent(token)}`
}
