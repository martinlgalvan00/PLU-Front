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

// Invitación abierta: el admin elige sólo el rol y la persona completa nombre y
// email al abrir el enlace. Hasta entonces la cuenta existe con un email
// reservado que no puede recibir correo (TLD `.invalid`, RFC 2606).
export const PENDING_INVITE_DOMAIN = 'pendiente.invalid'
export const PENDING_INVITE_NAME = 'Invitación pendiente'

export function buildPendingInviteEmail(seed) {
  return `invitacion-${seed}@${PENDING_INVITE_DOMAIN}`
}

export function isPendingInviteEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
    .endsWith(`@${PENDING_INVITE_DOMAIN}`)
}

export function buildStaffInvitationUrl(appUrl, token) {
  const base = String(appUrl ?? '').replace(/\/$/, '')
  return `${base}/?invitacion-staff=${encodeURIComponent(token)}`
}
