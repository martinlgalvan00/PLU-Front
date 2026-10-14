import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'
import {
  decryptPaymentProfileSecrets,
  encryptPaymentProfileSecrets,
  isPaymentProfileSecretsKeyConfigured,
} from './paymentProfileSecrets.js'

/**
 * Vinculación de cuentas de Mercado Pago por OAuth.
 *
 * El staff toca "Conectar con Mercado Pago", inicia sesión en MP con la cuenta
 * que va a cobrar y autoriza la aplicación de PLU. MP vuelve al callback con un
 * `code` que se canjea server-to-server por un access token del VENDEDOR: los
 * pagos creados con ese token se acreditan en su cuenta, no en la de PLU.
 *
 * Docs (AR): /developers/es/docs/security/oauth/creation y .../renewal.
 * - El token dura 180 días; el refresh token ROTA en cada renovación (hay que
 *   guardar el nuevo y dar por muerto el anterior).
 * - El `redirect_uri` tiene que estar dado de alta, idéntico y en HTTPS, en
 *   "URLs de redireccionamiento" de la aplicación.
 * - PKCE es opt-in por aplicación: si se activa en MP pasa a ser obligatorio,
 *   así que acá va detrás de MERCADO_PAGO_OAUTH_PKCE para no romper una app que
 *   no lo tenga prendido.
 */

export const MERCADO_PAGO_AUTHORIZATION_URL = 'https://auth.mercadopago.com/authorization'
export const MERCADO_PAGO_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'
export const MERCADO_PAGO_ME_URL = 'https://api.mercadopago.com/users/me'
export const MERCADO_PAGO_OAUTH_CALLBACK_PATH = '/api/payment-profiles/mercado-pago/oauth/callback'
export const MERCADO_PAGO_OAUTH_LANDING_PATH = '/admin/mercado-pago/vinculacion'

// El `code` de MP vive 10 minutos; el estado no necesita durar más que eso
// más el tiempo de iniciar sesión en MP.
const STATE_TTL_MS = 20 * 60 * 1000
const STATE_PURPOSE = 'mp_oauth_state'
const REQUEST_TIMEOUT_MS = 10_000

function trimText(value) {
  return String(value ?? '').trim()
}

function withoutTrailingSlash(value) {
  return trimText(value).replace(/\/+$/, '')
}

// En producción `resolveDeploymentAppUrl` devuelve el origen oficial con www:
// el apex redirige con 308 y el redirect_uri tiene que coincidir exacto con el
// registrado en MP, así que no se arma desde un APP_URL suelto.
function resolveAppOrigin(env) {
  return withoutTrailingSlash(resolveDeploymentAppUrl(env) || env.VITE_APP_URL)
}

/**
 * Configuración efectiva. `available` es falso mientras falte algo: el panel lo
 * usa para mostrar el botón o la lista de lo que hay que cargar.
 */
export function getMercadoPagoOAuthConfig(env = process.env) {
  const clientId = trimText(env.MERCADO_PAGO_CLIENT_ID)
  const clientSecret = trimText(env.MERCADO_PAGO_CLIENT_SECRET)
  const appOrigin = resolveAppOrigin(env)
  const apiOrigin = withoutTrailingSlash(env.API_URL) || appOrigin
  const redirectUri =
    trimText(env.MERCADO_PAGO_OAUTH_REDIRECT_URI) ||
    (apiOrigin ? `${apiOrigin}${MERCADO_PAGO_OAUTH_CALLBACK_PATH}` : '')
  const secretsKey = isPaymentProfileSecretsKeyConfigured(env)

  const missing = []
  if (!clientId) missing.push('MERCADO_PAGO_CLIENT_ID')
  if (!clientSecret) missing.push('MERCADO_PAGO_CLIENT_SECRET')
  if (!redirectUri) missing.push('APP_URL')
  if (!secretsKey) missing.push('PAYMENT_PROFILE_SECRETS_KEY')

  return {
    available: missing.length === 0,
    missing,
    clientId,
    clientSecret,
    redirectUri,
    appOrigin,
    pkce: trimText(env.MERCADO_PAGO_OAUTH_PKCE).toLowerCase() === 'true',
  }
}

export function assertMercadoPagoOAuthAvailable(env = process.env) {
  const config = getMercadoPagoOAuthConfig(env)
  if (!config.available) {
    throw new HttpError(
      503,
      `La vinculación con Mercado Pago no está configurada (falta ${config.missing.join(', ')}).`,
      { code: 'MP_OAUTH_NOT_CONFIGURED', missing: config.missing },
    )
  }
  return config
}

/**
 * El estado viaja por el navegador del staff hasta MP y vuelve. Va cifrado
 * (AES-GCM con la misma clave de los perfiles): MP pide que no lleve datos
 * sensibles en claro y acá adentro viaja el `code_verifier` de PKCE. El tag de
 * GCM además lo vuelve infalsificable, que es lo que protege el callback (no
 * lleva sesión: es una redirección de MP, sin el bearer del panel).
 */
export function createMercadoPagoOAuthState(payload, env = process.env, now = new Date()) {
  return encryptPaymentProfileSecrets(
    {
      ...payload,
      purpose: STATE_PURPOSE,
      nonce: randomBytes(12).toString('base64url'),
      exp: now.getTime() + STATE_TTL_MS,
    },
    env,
  )
}

export function readMercadoPagoOAuthState(state, env = process.env, now = new Date()) {
  let decoded = null
  try {
    decoded = decryptPaymentProfileSecrets(trimText(state), env)
  } catch {
    decoded = null
  }
  if (!decoded || decoded.purpose !== STATE_PURPOSE) {
    throw new HttpError(400, 'El enlace de vinculación no es válido.', {
      code: 'MP_OAUTH_STATE_INVALID',
    })
  }
  if (!Number.isFinite(decoded.exp) || decoded.exp < now.getTime()) {
    throw new HttpError(400, 'El enlace de vinculación venció. Volvé a intentarlo.', {
      code: 'MP_OAUTH_STATE_EXPIRED',
    })
  }
  return decoded
}

export function createPkcePair() {
  const verifier = randomBytes(48).toString('base64url') // 64 chars, dentro de 43..128
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildMercadoPagoAuthorizationUrl(config, { state, codeChallenge = null }) {
  const url = new URL(MERCADO_PAGO_AUTHORIZATION_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('platform_id', 'mp')
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', config.redirectUri)
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  return url.toString()
}

async function postToken(body, { fetchImpl = fetch } = {}) {
  let response
  try {
    response = await fetchImpl(MERCADO_PAGO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new HttpError(502, 'Mercado Pago no respondió al vincular la cuenta.', {
      code: 'MP_OAUTH_UNREACHABLE',
      cause: error?.message ?? null,
    })
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.access_token) {
    // `invalid_grant` = code/refresh vencido, revocado, de otra app o con
    // redirect_uri distinto. Es el que dice "hay que volver a conectar".
    const providerError = trimText(payload?.error) || `http_${response.status}`
    throw new HttpError(
      providerError === 'invalid_grant' ? 409 : 502,
      providerError === 'invalid_grant'
        ? 'Mercado Pago rechazó la autorización: hay que volver a conectar la cuenta.'
        : 'Mercado Pago rechazó el pedido de credenciales.',
      {
        code: providerError === 'invalid_grant' ? 'MP_OAUTH_INVALID_GRANT' : 'MP_OAUTH_TOKEN_FAILED',
        providerError,
        providerMessage: trimText(payload?.message).slice(0, 240) || null,
      },
    )
  }
  return payload
}

/** Normaliza la respuesta de /oauth/token a lo que se guarda. */
export function mapMercadoPagoTokenResponse(payload, now = new Date()) {
  const expiresIn = Number(payload.expires_in)
  return {
    accessToken: trimText(payload.access_token),
    refreshToken: trimText(payload.refresh_token),
    publicKey: trimText(payload.public_key),
    userId: trimText(payload.user_id),
    liveMode: payload.live_mode !== false,
    scope: trimText(payload.scope),
    expiresAt: Number.isFinite(expiresIn)
      ? new Date(now.getTime() + expiresIn * 1000).toISOString()
      : null,
  }
}

export async function exchangeMercadoPagoAuthorizationCode(
  config,
  { code, codeVerifier = null },
  { fetchImpl, now = new Date() } = {},
) {
  const payload = await postToken(
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    },
    { fetchImpl },
  )
  return mapMercadoPagoTokenResponse(payload, now)
}

export async function refreshMercadoPagoAccessToken(
  config,
  refreshToken,
  { fetchImpl, now = new Date() } = {},
) {
  const payload = await postToken(
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    { fetchImpl },
  )
  return mapMercadoPagoTokenResponse(payload, now)
}

/**
 * Nombre visible de la cuenta conectada ("quién cobra"). Es cosmético: si MP no
 * responde la vinculación sigue, con el user_id como etiqueta.
 */
export async function fetchMercadoPagoAccountIdentity(accessToken, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(MERCADO_PAGO_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const me = await response.json()
    const fullName = [me?.first_name, me?.last_name].map(trimText).filter(Boolean).join(' ')
    return {
      nickname: trimText(me?.nickname) || null,
      email: trimText(me?.email) || null,
      name: fullName || trimText(me?.company?.brand_name) || null,
      siteId: trimText(me?.site_id) || null,
    }
  } catch {
    return null
  }
}

/** Días de margen antes del vencimiento a partir de los cuales se renueva. */
export const MERCADO_PAGO_OAUTH_REFRESH_WINDOW_DAYS = 30
/** Días antes del vencimiento en que el panel avisa "por vencer". */
export const MERCADO_PAGO_OAUTH_WARNING_DAYS = 15

/**
 * Estado de una cuenta para el panel y para los avisos de publicación.
 * manual · connected · expiring · needs_reconnect
 */
export function mercadoPagoConnectionStatus(config = {}, now = new Date()) {
  if (config.connection !== 'oauth') return 'manual'
  if (config.status === 'needs_reconnect') return 'needs_reconnect'
  const expiresAt = config.expiresAt ? Date.parse(config.expiresAt) : NaN
  if (Number.isFinite(expiresAt)) {
    if (expiresAt <= now.getTime()) return 'needs_reconnect'
    const days = (expiresAt - now.getTime()) / 86_400_000
    if (days <= MERCADO_PAGO_OAUTH_WARNING_DAYS) return 'expiring'
  }
  return 'connected'
}

export function mercadoPagoOAuthLandingUrl(config, params = {}) {
  const url = new URL(`${config.appOrigin || ''}${MERCADO_PAGO_OAUTH_LANDING_PATH}`)
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}
