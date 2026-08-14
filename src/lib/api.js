import { env } from '../config/env.js'

class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function apiRequest(path, options = {}) {
  const url = `${env.apiUrl}${path}`
  const method = options.method ?? 'GET'
  const { headers, ...requestOptions } = options
  const mutationHeaders = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
    ? { 'X-PLU-Request': 'browser' }
    : {}

  let response
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...mutationHeaders,
        ...(headers ?? {}),
      },
      ...requestOptions,
    })
  } catch (error) {
    throw new ApiError(
      'El servicio no está disponible en este momento. Reintentá en unos segundos.',
      {
        status: 0,
        body: {
          apiUrl: env.apiUrl,
          cause: error instanceof Error ? error.message : String(error),
          developmentCommand: 'npm run dev:services',
        },
      },
    )
  }

  const body = await parseResponse(response)

  if (!response.ok) {
    // Vite proxyea /api; si la API no está arriba responde 502 con HTML.
    // Traducimos a un mensaje accionable en vez de "Error 502".
    const unavailable =
      (response.status === 502 || response.status === 503 || response.status === 504) &&
      (!body || typeof body !== 'object' || !body.error || body.error === 'Error interno')
    const unavailableMessage = env.isDev
      ? 'El servicio no esta disponible en este momento. En local levanta la API con npm run dev:api (o npm run dev:services).'
      : 'No pudimos iniciar el servicio en este momento. Intenta nuevamente o contacta soporte.'
    throw new ApiError(
      unavailable ? unavailableMessage : body?.error ?? `Error ${response.status}`,
      {
        status: response.status,
        body: typeof body === 'object' && body ? body : { error: body },
      },
    )
  }

  return body
}

export function apiPost(path, payload) {
  return apiRequest(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function apiPatch(path, payload) {
  return apiRequest(path, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' })
}

export function apiGet(path) {
  return apiRequest(path)
}

export { ApiError }

export function loginRequest(credentials) {
  return apiPost('/api/auth/login', credentials)
}

export function acceptStaffInvitationRequest({ token, password }) {
  return apiPost('/api/auth/accept-staff-invitation', { token, password })
}

export function createSecurityUserRequest({ name, email, eventId, sendEmail = false }) {
  return apiPost('/api/auth/security-users', { name, email, eventId, sendEmail })
}

export function createSecurityUsersBulkRequest({ eventId, users, sendEmail = false }) {
  return apiPost('/api/auth/security-users/bulk', { eventId, users, sendEmail })
}

export function deactivateAllSecurityUsersRequest(eventId) {
  return apiPost('/api/auth/security-users/deactivate-all', { eventId })
}

export function createSecurityAccessLinkRequest(userId, sendEmail = false) {
  return apiPost(`/api/auth/security-users/${encodeURIComponent(userId)}/access-link`, { sendEmail })
}

export function securityGateRequest(token) {
  return apiPost('/api/auth/security-gate', { token })
}

export function listSecurityUsersRequest(eventId) {
  return apiGet(`/api/auth/security-users?eventId=${encodeURIComponent(eventId)}`)
}

export function updateSecurityUserStatusRequest(userId, status) {
  return apiPatch(`/api/auth/security-users/${encodeURIComponent(userId)}/status`, { status })
}

// Cuentas de staff del panel (admin/operador/viewer). El alta manda un enlace
// firmado y de un solo uso para que la persona elija su contraseña.
export function listStaffUsersRequest() {
  return apiGet('/api/users')
}

export function createStaffUserRequest({ name, email, role, sendEmail = true }) {
  return apiPost('/api/users', { name, email, role, sendEmail })
}

export function resetStaffPasswordRequest(userId, sendEmail = true) {
  return apiPost(`/api/users/${encodeURIComponent(userId)}/reset-password`, { sendEmail })
}

export function updateStaffUserRoleRequest(userId, roleKey) {
  return apiPatch(`/api/users/${encodeURIComponent(userId)}/role`, { roleKey })
}

export function updateStaffUserStatusRequest(userId, status) {
  return apiPatch(`/api/users/${encodeURIComponent(userId)}/status`, { status })
}

export function deleteStaffUserRequest(userId) {
  return apiDelete(`/api/users/${encodeURIComponent(userId)}`)
}

export function listAccessRolesRequest() {
  return apiGet('/api/access-control/roles')
}

export function createAccessRoleRequest({ name, description, permissionKeys = [] }) {
  return apiPost('/api/access-control/roles', { name, description, permissionKeys })
}

export function updateAccessRolePermissionsRequest(roleId, permissionKeys) {
  return apiPatch(`/api/access-control/roles/${encodeURIComponent(roleId)}/permissions`, {
    permissionKeys,
  })
}

export function updateAccessRoleStatusRequest(roleId, active) {
  return apiPatch(`/api/access-control/roles/${encodeURIComponent(roleId)}/status`, { active })
}

export function meRequest() {
  return apiRequest('/api/auth/me')
}

// Mi cuenta. `changeOwnPassword` es el único endpoint alcanzable mientras la
// cuenta arrastra una contraseña temporal; el resto del panel responde 403 con
// code `password_change_required` hasta que se resuelva.
export function changeOwnPasswordRequest({ currentPassword, password }) {
  return apiPost('/api/auth/me/password', { currentPassword, password })
}

export function requestEmailChangeRequest({ email, currentPassword }) {
  return apiPost('/api/auth/me/email', { email, currentPassword })
}

export function confirmEmailChangeRequest(token) {
  return apiPost('/api/auth/verify-email-change', { token })
}

export function logoutRequest() {
  return apiPost('/api/auth/logout', {})
}

export function oauthSessionRequest(accessToken) {
  return apiRequest('/api/auth/oauth/session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  })
}
