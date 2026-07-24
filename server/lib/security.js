import { HttpError } from './errors.js'

const TRUSTED_BROWSER_HEADER = 'x-plu-request'
const TRUSTED_BROWSER_VALUE = 'browser'
const SERVER_TO_SERVER_MUTATION_PATHS = new Set(['/api/payments/webhook'])

function asOrigin(value) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return null

  try {
    const url = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
    return new URL(url).origin
  } catch {
    return null
  }
}

export function getAllowedOrigins(env = process.env) {
  const configuredOrigins = String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return [
    env.APP_URL,
    env.VITE_APP_URL,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    ...configuredOrigins,
    'http://localhost:5173',
  ]
    .map(asOrigin)
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index)
}

export function corsOrigin(origin, callback) {
  if (!origin || getAllowedOrigins().includes(origin)) {
    callback(null, true)
    return
  }

  callback(new HttpError(403, 'Origen no permitido'))
}

export function requireTrustedMutation(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next()
    return
  }

  const origin = req.get('origin')
  if (origin && !getAllowedOrigins().includes(origin)) {
    next(new HttpError(403, 'Origen no permitido'))
    return
  }

  if (SERVER_TO_SERVER_MUTATION_PATHS.has(req.path)) {
    next()
    return
  }

  if (origin && req.get(TRUSTED_BROWSER_HEADER) !== TRUSTED_BROWSER_VALUE) {
    next(new HttpError(403, 'Solicitud no confiable'))
    return
  }

  next()
}
