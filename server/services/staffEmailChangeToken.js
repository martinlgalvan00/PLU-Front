import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../lib/errors.js'

/**
 * Token firmado para confirmar el cambio de email de una cuenta del panel
 * (stateless). payload = { uid, eml, typ: 'staff_email_change', exp }
 *
 * Mismo esquema que `emailVerificationToken.js` / `passwordResetToken.js`, con
 * una diferencia central: el email nuevo viaja **dentro** del payload firmado.
 * Sin eso, el link tendría que llevarlo en la query y cualquiera podría mover
 * la cuenta a una dirección distinta de la que se verificó.
 *
 * El `typ` propio impide que un token de reset de atleta o de verificación
 * sirva acá, aunque los tres compartan `AUTH_SECRET`.
 *
 * TTL de 24 h: el link se manda a la casilla nueva y confirmarlo es una acción
 * deliberada del usuario, que ya está logueado cuando la pide.
 */

const TOKEN_TYPE = 'staff_email_change'
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24

function resolveSecret(secret = process.env.AUTH_SECRET) {
  const value = secret?.trim()
  if (!value) {
    throw new HttpError(503, 'Falta AUTH_SECRET para firmar el cambio de email.')
  }
  return value
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * @param {{ userId: string, email: string, expiresAt?: Date, secret?: string }} params
 */
export function createStaffEmailChangeToken({ userId, email, expiresAt, secret }) {
  const key = resolveSecret(secret)
  const expDate = expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS)
  const payload = {
    uid: userId,
    eml: String(email).trim().toLowerCase(),
    typ: TOKEN_TYPE,
    exp: Math.floor(expDate.getTime() / 1000),
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, key)}`
}

/**
 * @param {string} token
 * @param {{ secret?: string, now?: Date }} [options]
 * @returns {{ uid: string, eml: string, exp: number } | null}
 */
export function verifyStaffEmailChangeToken(token, { secret, now = new Date() } = {}) {
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

  if (payload?.typ !== TOKEN_TYPE || !payload?.uid || !payload?.eml) return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now.getTime()) return null

  return { uid: payload.uid, eml: payload.eml, exp: payload.exp }
}

export const STAFF_EMAIL_CHANGE_TTL_MS = DEFAULT_TTL_MS
