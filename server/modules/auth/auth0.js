import { auth } from 'express-oauth2-jwt-bearer'

function normalizeIssuerBaseUrl(domain) {
  const trimmed = domain.trim().replace(/\/+$/, '')
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return `${withProtocol}/`
}

export function createAuth0Config(env = process.env) {
  const domain = env.AUTH0_DOMAIN?.trim()
  const audience = env.AUTH0_AUDIENCE?.trim()

  if (!domain || !audience) return null

  return {
    audience,
    issuerBaseURL: normalizeIssuerBaseUrl(domain),
    tokenSigningAlg: 'RS256',
  }
}

export function requireAuth0Config(env = process.env) {
  const config = createAuth0Config(env)
  if (!config) {
    throw new Error('Auth0 no está configurado.')
  }

  return config
}

export function createAuth0JwtCheck({ env = process.env, sdkAuth = auth } = {}) {
  return sdkAuth(requireAuth0Config(env))
}
