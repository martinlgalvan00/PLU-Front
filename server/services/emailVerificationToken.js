import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../lib/errors.js'

/**
 * Token firmado para verificar el email de un atleta (stateless).
 * payload = { aid, exp, typ: 'email_verify' }
 *
 * Mismo esquema que `passwordResetToken.js`, con dos diferencias:
 *
 *  - TTL de 7 días en vez de 30 minutos. El link no otorga ninguna credencial,
 *    y un vencimiento corto solo garantiza que quien lo abre al día siguiente
 *    tenga que pedir otro.
 *  - No se persiste el hash: el uso único no aporta nada acá. Reabrir el link
 *    sobre una cuenta ya verificada es idempotente y no da acceso a nada.
 *
 * El `typ` distinto impide que un token de reset sirva para verificar y
 * viceversa, aunque compartan `AUTH_SECRET`.
 */

const TOKEN_TYPE = 'email_verify'
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 días

function resolveSecret(secret = process.env.AUTH_SECRET) {
  const value = secret?.trim()
  if (!value) {
    throw new HttpError(503, 'Falta AUTH_SECRET para firmar la verificación de email.')
  }
  return value
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * @param {{ athleteId: string, expiresAt?: Date, secret?: string }} params
 */
export function createEmailVerificationToken({ athleteId, expiresAt, secret }) {
  const key = resolveSecret(secret)
  const expDate = expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS)
  const payload = {
    aid: athleteId,
    typ: TOKEN_TYPE,
    exp: Math.floor(expDate.getTime() / 1000),
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, key)}`
}

/**
 * @param {string} token
 * @param {{ secret?: string, now?: Date }} [options]
 * @returns {{ aid: string, exp: number } | null}
 */
export function verifyEmailVerificationToken(token, { secret, now = new Date() } = {}) {
  const key = resolveSecret(secret)
  if (typeof token !== 'string' || !token.includes('.')) return null

  const [payloadB64, providedSig] = token.split('.')
  if (!payloadB64 || !providedSig) return null

  const expectedSig = sign(payloadB64, key)
  const providedBuf = Buffer.from(providedSig)
  const expectedBuf = Buffer.from(expectedSig)
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return null
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (payload?.typ !== TOKEN_TYPE || !payload?.aid || typeof payload.exp !== 'number') return null
  if (payload.exp * 1000 <= now.getTime()) return null

  return { aid: payload.aid, exp: payload.exp }
}

export const EMAIL_VERIFICATION_TTL_MS = DEFAULT_TTL_MS
