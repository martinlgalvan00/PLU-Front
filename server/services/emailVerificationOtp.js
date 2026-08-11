import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * OTP de 6 dígitos para verificar el email del atleta cuando el deep link
 * del mail no abre. El valor crudo viaja en el HTML; en DB solo el hash.
 */

export const EMAIL_OTP_LENGTH = 6
export const EMAIL_OTP_TTL_MS = 1000 * 60 * 60 * 24 // 24 h
export const EMAIL_OTP_MAX_ATTEMPTS = 8

/** Genera un código numérico de 6 dígitos (000000–999999, con ceros). */
export function createEmailVerificationOtp() {
  return String(randomInt(0, 1_000_000)).padStart(EMAIL_OTP_LENGTH, '0')
}

export function hashEmailVerificationOtp(code) {
  const normalized = normalizeEmailVerificationOtp(code)
  if (!normalized) return ''
  return createHash('sha256').update(normalized).digest('hex')
}

export function normalizeEmailVerificationOtp(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length !== EMAIL_OTP_LENGTH) return ''
  return digits
}

export function emailOtpsEqual(a, b) {
  const left = Buffer.from(String(a ?? ''))
  const right = Buffer.from(String(b ?? ''))
  if (left.length === 0 || left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
