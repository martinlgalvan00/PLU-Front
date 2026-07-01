import { HttpError } from './errors.js'

const TRUSTED_BROWSER_HEADER = 'x-plu-request'
const TRUSTED_BROWSER_VALUE = 'browser'
const SERVER_TO_SERVER_MUTATION_PATHS = new Set(['/api/payments/webhook'])

export function getAllowedOrigins() {
  return [process.env.APP_URL, process.env.VITE_APP_URL, 'http://localhost:5173'].filter(Boolean)
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
