import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../lib/errors.js'

const TOKEN_TYPE = 'staff_invitation'

function resolveSecret(secret = process.env.AUTH_SECRET) {
  const value = secret?.trim()
  if (!value) {
    throw new HttpError(503, 'Falta AUTH_SECRET para firmar invitaciones de staff.')
  }
  return value
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

function parsePayload(payloadB64) {
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Versión opaca de la credencial pendiente. Cambia cada vez que se reemite la
 * invitación y al elegir una contraseña, por lo que invalida enlaces viejos sin
 * persistir el token ni agregar una columna nueva.
 */
export function staffCredentialVersion(passwordHash) {
  if (!passwordHash) return ''
  return createHash('sha256').update(String(passwordHash)).digest('base64url').slice(0, 24)
}

/** Huella no reversible para idempotencia/auditoría; nunca persiste el bearer token. */
export function staffInvitationFingerprint(token) {
  return createHash('sha256').update(String(token)).digest('hex').slice(0, 24)
}

export function createStaffInvitationToken({ userId, credentialHash, expiresAt, secret }) {
  const key = resolveSecret(secret)
  const payload = {
    uid: userId,
    cv: staffCredentialVersion(credentialHash),
    typ: TOKEN_TYPE,
    exp: Math.floor(expiresAt.getTime() / 1000),
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, key)}`
}

/**
 * Extrae el sujeto sin considerarlo autenticado. Sirve solamente para buscar la
 * cuenta y luego verificar firma + versión con `verifyStaffInvitationToken`.
 */
export function readStaffInvitationSubject(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payloadB64] = token.split('.')
  const payload = parsePayload(payloadB64)
  return payload?.typ === TOKEN_TYPE && payload?.uid ? payload.uid : null
}

/**
 * @returns {{ uid: string, cv: string, exp: number } | null}
 */
export function verifyStaffInvitationToken(
  token,
  { credentialHash, secret, now = new Date() } = {},
) {
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

  const payload = parsePayload(payloadB64)

  if (payload?.typ !== TOKEN_TYPE || !payload?.uid || !payload?.cv) return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now.getTime()) return null
  if (!credentialHash || payload.cv !== staffCredentialVersion(credentialHash)) return null

  return { uid: payload.uid, cv: payload.cv, exp: payload.exp }
}
