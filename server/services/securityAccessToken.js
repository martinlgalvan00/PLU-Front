import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../lib/errors.js'

/**
 * securityAccessToken.js — PLU ARG
 *
 * Token de acceso de puerta: una credencial firmada (HMAC-SHA256 con
 * AUTH_SECRET) que deja entrar a una cuenta seguridad_plu_arg SIN tipear
 * contraseña. Es stateless a propósito — no hay tabla nueva ni columna:
 *
 *   token = base64url(payload).base64url(hmac(payload))
 *   payload = { uid, eid, exp }   // exp en epoch-segundos
 *
 * Garantías:
 *  - Integridad: la firma HMAC impide fabricar o alterar un token sin el
 *    secreto del servidor.
 *  - Vencimiento: `exp` corta el token pasado el evento.
 *  - Revocación: NO vive en el token — el login por token (POST
 *    /security-gate) revalida user.status === 'active' y el evento asignado,
 *    así que dar de baja la cuenta invalida la credencial al instante sin
 *    tener que rotar secretos ni mantener una blocklist.
 */

function resolveSecret(secret = process.env.AUTH_SECRET) {
  const value = secret?.trim()
  if (!value) {
    throw new HttpError(503, 'Falta AUTH_SECRET para firmar credenciales de acceso.')
  }
  return value
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * @param {{ userId: string, eventId: string, expiresAt: Date, secret?: string }} params
 * @returns {string}
 */
export function createAccessToken({ userId, eventId, expiresAt, secret }) {
  const key = resolveSecret(secret)
  const payload = { uid: userId, eid: eventId, exp: Math.floor(expiresAt.getTime() / 1000) }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, key)}`
}

/**
 * Verifica firma y vencimiento. Devuelve el payload o null si el token es
 * inválido/alterado/vencido (nunca tira — el caller decide el 401).
 * @param {string} token
 * @param {{ secret?: string, now?: Date }} [options]
 * @returns {{ uid: string, eid: string, exp: number } | null}
 */
export function verifyAccessToken(token, { secret, now = new Date() } = {}) {
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

  if (!payload?.uid || !payload?.eid || typeof payload.exp !== 'number') return null
  if (payload.exp * 1000 <= now.getTime()) return null

  return payload
}
