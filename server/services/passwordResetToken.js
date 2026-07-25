import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../lib/errors.js'

/**
 * Token firmado para reset de contraseña de atleta (stateless).
 * payload = { aid, exp, typ: 'pwd_reset' }
 */

const TOKEN_TYPE = 'pwd_reset'
const DEFAULT_TTL_MS = 1000 * 60 * 30 // 30 min

function resolveSecret(secret = process.env.AUTH_SECRET) {
  const value = secret?.trim()
  if (!value) {
    throw new HttpError(503, 'Falta AUTH_SECRET para firmar el reset de contraseña.')
  }
  return value
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * @param {{ athleteId: string, expiresAt?: Date, secret?: string }} params
 */
export function createPasswordResetToken({ athleteId, expiresAt, secret }) {
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
export function verifyPasswordResetToken(token, { secret, now = new Date() } = {}) {
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
