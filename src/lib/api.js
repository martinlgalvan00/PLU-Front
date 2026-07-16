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
      `No se pudo conectar con la API (${env.apiUrl}). Corré "npm run dev:api" o "npm run dev:all".`,
      {
        status: 0,
        body: { cause: error instanceof Error ? error.message : String(error) },
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

export function apiGet(path) {
  return apiRequest(path)
}

export { ApiError }

export function loginRequest(credentials) {
  return apiPost('/api/auth/login', credentials)
}

export function createSecurityUserRequest({ name, email, eventId }) {
  return apiPost('/api/auth/security-users', { name, email, eventId })
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
