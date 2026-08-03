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
          developmentCommand: 'npm run dev',
        },
      },
    )
  }

  const body = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(body?.error ?? `Error ${response.status}`, {
      status: response.status,
      body,
    })
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

export function apiGet(path) {
  return apiRequest(path)
}

export { ApiError }

export function loginRequest(credentials) {
  return apiPost('/api/auth/login', credentials)
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

// Cuentas de staff del panel (admin/operador/viewer). Alta por invitación
// Auth0 -- se crean sin contraseña y entran por OAuth (ver server/routes/users.js).
export function listStaffUsersRequest() {
  return apiGet('/api/users')
}

export function createStaffUserRequest({ name, email, role }) {
  return apiPost('/api/users', { name, email, role })
}

export function updateStaffUserRoleRequest(userId, roleKey) {
  return apiPatch(`/api/users/${encodeURIComponent(userId)}/role`, { roleKey })
}

export function updateStaffUserStatusRequest(userId, status) {
  return apiPatch(`/api/users/${encodeURIComponent(userId)}/status`, { status })
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

export function meRequest() {
  return apiRequest('/api/auth/me')
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
