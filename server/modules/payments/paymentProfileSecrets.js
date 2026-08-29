import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'

const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i
const PREFIX = 'v1'

function configured(value) {
  const normalized = String(value ?? '').trim()
  return Boolean(normalized && !PLACEHOLDER_PATTERN.test(normalized))
}

/**
 * Deriva una clave de 32 bytes desde PAYMENT_PROFILE_SECRETS_KEY.
 * Acepta hex de 64 chars, base64 de 32 bytes, o passphrase (scrypt).
 */
export function resolvePaymentProfileSecretsKey(env = process.env) {
  const raw = String(env.PAYMENT_PROFILE_SECRETS_KEY ?? '').trim()
  if (!configured(raw)) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  try {
    const fromB64 = Buffer.from(raw, 'base64')
    if (fromB64.length === 32) return fromB64
  } catch {
    // passphrase path
  }
  return scryptSync(raw, 'plu-payment-profiles', 32)
}

export function assertPaymentProfileSecretsKey(env = process.env) {
  const key = resolvePaymentProfileSecretsKey(env)
  if (!key) {
    throw new HttpError(
      503,
      'Falta PAYMENT_PROFILE_SECRETS_KEY para guardar credenciales de Mercado Pago por perfil.',
      { code: 'PAYMENT_PROFILE_SECRETS_KEY_MISSING' },
    )
  }
  return key
}

/**
 * Cifra un objeto de secrets. Formato: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 */
export function encryptPaymentProfileSecrets(secrets, env = process.env) {
  const key = assertPaymentProfileSecretsKey(env)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(
    ':',
  )
}

export function decryptPaymentProfileSecrets(ciphertext, env = process.env) {
  if (!ciphertext) return null
  const key = assertPaymentProfileSecretsKey(env)
  const parts = String(ciphertext).split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new HttpError(500, 'Ciphertext de perfil de cobro inválido.')
  }
  const [, ivB64, tagB64, dataB64] = parts
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString('utf8'))
}

export function isPaymentProfileSecretsKeyConfigured(env = process.env) {
  return Boolean(resolvePaymentProfileSecretsKey(env))
}
