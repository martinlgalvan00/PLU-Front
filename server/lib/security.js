import { HttpError } from './errors.js'

const TRUSTED_BROWSER_HEADER = 'x-plu-request'
const TRUSTED_BROWSER_VALUE = 'browser'
// Webhooks entrantes: no los manda un browser, así que no pueden traer el
// header de mutación confiable. Cada uno valida su propio origen (firma de
// Mercado Pago, token compartido en el de Brevo).
const SERVER_TO_SERVER_MUTATION_PATHS = new Set([
  '/api/payments/webhook/mercadopago',
  // Alias legacy: preferir /mercadopago en panel MP y notification_url nuevas.
  '/api/payments/webhook',
  '/api/emails/webhook/brevo',
])

// El flush de analítica en `pagehide` usa `navigator.sendBeacon`: es la única
// forma de que la salida no se cancele al descargarse el documento, pero la
// API no deja adjuntar headers custom, así que nunca puede traer el header de
// mutación confiable. El endpoint es público, sin auth y de solo escritura
// (rate-limitado aparte), así que alcanza con el chequeo de Origin de arriba.
const BEACON_MUTATION_PATHS = new Set(['/api/analytics/collect'])

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
    'http://127.0.0.1:5173',
  ]
    .map(asOrigin)
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index)
}

// Vite salta a 5174/5175 si el puerto default está ocupado. En local (sin
// Vercel) aceptamos cualquier puerto de loopback para no romper el login.
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/i

export function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true
  if (getAllowedOrigins(env).includes(origin)) return true
  if (!env.VERCEL && LOCAL_DEV_ORIGIN.test(origin)) return true
  return false
}

export function corsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) {
    callback(null, true)
    return
  }

  callback(new HttpError(403, 'Origen no permitido'))
}

export function resolveMutationPathname(req) {
  const candidates = [
    req.path,
    typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : null,
    typeof req.url === 'string' ? req.url.split('?')[0] : null,
    req.get?.('x-invoke-path'),
    req.get?.('x-matched-path'),
    req.get?.('x-forwarded-uri'),
  ]

  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim()
    if (!raw) continue
    try {
      const pathname = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw
      const normalized = pathname.replace(/\/+$/, '') || '/'
      if (
        SERVER_TO_SERVER_MUTATION_PATHS.has(normalized)
        || BEACON_MUTATION_PATHS.has(normalized)
      ) return normalized
    } catch {
      // Seguir con el siguiente candidato.
    }
  }

  return String(req.path ?? '').replace(/\/+$/, '') || '/'
}

export function isServerToServerMutationPath(req) {
  const pathname = resolveMutationPathname(req)
  if (SERVER_TO_SERVER_MUTATION_PATHS.has(pathname)) return true

  // Fallback para rewrites de Vercel donde path/url pueden diferir del path público.
  // Orden: primero los paths más específicos para no confundir /webhook con /webhook/mercadopago.
  const haystack = [
    req.path,
    req.originalUrl,
    req.url,
    req.get?.('x-invoke-path'),
    req.get?.('x-matched-path'),
    req.get?.('x-forwarded-uri'),
  ]
    .map((value) => String(value ?? '').split('?')[0])
    .join('\n')

  for (const allowed of [
    '/api/payments/webhook/mercadopago',
    '/api/emails/webhook/brevo',
    '/api/payments/webhook',
  ]) {
    if (haystack.includes(allowed)) return true
  }

  return false
}

export function requireTrustedMutation(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next()
    return
  }

  const origin = req.get('origin')
  if (origin && !isAllowedOrigin(origin)) {
    next(new HttpError(403, 'Origen no permitido'))
    return
  }

  if (isServerToServerMutationPath(req)) {
    next()
    return
  }

  // A diferencia del bypass server-to-server, acá se exige un Origin presente
  // y permitido (no simplemente ausente): es la única señal que sendBeacon
  // deja mandar, así que no puede quedar opcional como en el resto de la ruta.
  if (origin && isAllowedOrigin(origin) && BEACON_MUTATION_PATHS.has(resolveMutationPathname(req))) {
    next()
    return
  }

  // El header de mutación confiable se exige siempre, haya o no `Origin`.
  // Antes la comprobación colgaba de `origin &&`, así que bastaba con omitir
  // el header `Origin` -- trivial desde cualquier cliente que no sea un
  // browser -- para saltear el control entero. La cookie es SameSite=Lax, con
  // lo cual el CSRF clásico por formulario ya estaba cubierto; esto devuelve
  // la capa de defensa en profundidad que se creía activa.
  if (req.get(TRUSTED_BROWSER_HEADER) !== TRUSTED_BROWSER_VALUE) {
    next(new HttpError(403, 'Solicitud no confiable'))
    return
  }

  next()
}
