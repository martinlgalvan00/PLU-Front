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
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...mutationHeaders,
      ...(headers ?? {}),
    },
    ...requestOptions,
  })

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

export function loginRequest(credentials) {
  return apiPost('/api/auth/login', credentials)
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
