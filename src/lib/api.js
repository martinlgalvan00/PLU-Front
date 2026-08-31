import { env } from '../config/env.js'

class ApiError extends Error {
  constructor(message, { status, body, requestId = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    // En un 5xx el mensaje es opaco a proposito (ver server/lib/errors.js): el
    // requestId es lo unico que ata lo que ve el operador con el stack real.
    this.requestId = requestId
  }
}

/**
 * Endpoints donde un 401 es parte del flujo (probe de sesión, login, canjes
 * de token de un solo uso): no deben disparar el manejo global de expiración.
 */
function isExpectedAuthFailure(path) {
  if (path === '/api/athletes/session') return true
  if (!path.startsWith('/api/auth/')) return false
  // /api/auth/me/password y /api/auth/me/email sí operan con la sesión viva:
  // un 401 ahí es una sesión muerta de verdad.
  return !path.startsWith('/api/auth/me/')
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

// Sin esto, un backend que acepta la conexión y nunca contesta (colgado, no
// caído) deja el `fetch` sin resolver para siempre: quien esperaba esa
// respuesta -- un submit, un guard que bloquea el próximo intento -- se queda
// trabado en silencio, sin error ni reintento posible hasta recargar la
// página. 30s alcanza para cualquier pedido normal de la app (incluida la
// creación de una orden) sin cortar de más.
const DEFAULT_TIMEOUT_MS = 30000

export async function apiRequest(path, options = {}) {
  const url = `${env.apiUrl}${path}`
  const method = options.method ?? 'GET'
  const { headers, allowNotModified = false, timeoutMs = DEFAULT_TIMEOUT_MS, ...requestOptions } =
    options
  const mutationHeaders = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
    ? { 'X-PLU-Request': 'browser' }
    : {}

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

  let response
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...mutationHeaders,
        ...(headers ?? {}),
      },
      signal: timeoutController.signal,
      ...requestOptions,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(
        'El servicio está tardando más de lo esperado. Reintentá en unos segundos.',
        { status: 0, body: { apiUrl: env.apiUrl, timeoutMs } },
      )
    }
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
  } finally {
    clearTimeout(timeoutId)
  }

  // 304 sin body: el poll del panel/atleta reusa el snapshot en memoria.
  if (response.status === 304 && allowNotModified) {
    return {
      notModified: true,
      etag: response.headers?.get?.('ETag') ?? headers?.['If-None-Match'] ?? null,
      data: null,
    }
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
    const requestId = body?.requestId ?? response.headers?.get?.('X-Request-Id') ?? null
    // Se loguea aca y no en cada llamador: los `console.error` de los hooks
    // imprimen el ApiError, y su mensaje es deliberadamente opaco -- sin esta
    // linea el id de correlacion que la API si manda se pierde en el browser y
    // un 5xx reportado por un operador no se puede buscar en los logs.
    if (response.status >= 500 && requestId) {
      console.error(`[api] ${method} ${path} -> ${response.status} (requestId ${requestId})`)
    }
    // Sesión caída a mitad de camino: los polls y los submit la descubren
    // acá, una sola vez por origen, para que la UI pueda reaccionar en vez de
    // quedarse mirando datos congelados. Los endpoints donde el 401 es parte
    // del flujo quedan fuera.
    if (response.status === 401 && !isExpectedAuthFailure(path)) {
      window.dispatchEvent(new CustomEvent('plu:auth-expired', { detail: { path } }))
    }
    throw new ApiError(
      unavailable ? unavailableMessage : (body?.error ?? `Error ${response.status}`),
      {
        status: response.status,
        body: typeof body === 'object' && body ? body : { error: body },
        requestId,
      },
    )
  }

  if (allowNotModified) {
    return {
      notModified: false,
      etag: response.headers?.get?.('ETag') ?? null,
      data: body,
    }
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

/**
 * GET con revalidación condicional. Si el servidor responde 304,
 * `notModified` queda true y `data` es null (el caller retiene el cache).
 */
export function apiGetMeta(path, { etag = null } = {}) {
  const headers = etag ? { 'If-None-Match': etag } : {}
  return apiRequest(path, { headers, allowNotModified: true })
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
  return apiPost(`/api/auth/security-users/${encodeURIComponent(userId)}/access-link`, {
    sendEmail,
  })
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

// Zonas de seguridad del evento (puerta, pesaje, calentamiento, plataforma).
// Agrupan las cuentas de seguridad y les fijan alcance de escaneo y turno.
export function listSecurityZonesRequest(eventId) {
  return apiGet(`/api/security-zones?eventId=${encodeURIComponent(eventId)}`)
}

export function createSecurityZoneRequest(zone) {
  return apiPost('/api/security-zones', zone)
}

export function updateSecurityZoneRequest(zoneId, zone) {
  return apiPatch(`/api/security-zones/${encodeURIComponent(zoneId)}`, zone)
}

export function deleteSecurityZoneRequest(zoneId) {
  return apiDelete(`/api/security-zones/${encodeURIComponent(zoneId)}`)
}

export function presetSecurityZonesRequest({ eventId, eventSlug }) {
  return apiPost('/api/security-zones/preset', { eventId, eventSlug })
}

export function assignSecurityZoneRequest(userId, zoneId) {
  return apiPatch(`/api/security-zones/members/${encodeURIComponent(userId)}`, { zoneId })
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

/** Staff autenticado → cookie de atleta (mismo email) sin cerrar el panel. */
export function createStaffAthleteSessionRequest() {
  return apiPost('/api/auth/athlete-session', {})
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
