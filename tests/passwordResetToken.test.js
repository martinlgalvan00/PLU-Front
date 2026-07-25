import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPasswordResetToken,
  verifyPasswordResetToken,
} from '../server/services/passwordResetToken.js'

const SECRET = 'test-auth-secret-for-password-reset'

test('password reset token roundtrip', () => {
  const token = createPasswordResetToken({
    athleteId: 'ath-123',
    secret: SECRET,
    expiresAt: new Date(Date.now() + 60_000),
  })
  const payload = verifyPasswordResetToken(token, { secret: SECRET })
  assert.equal(payload?.aid, 'ath-123')
})

test('password reset token rejects tampering', () => {
  const token = createPasswordResetToken({
    athleteId: 'ath-123',
    secret: SECRET,
    expiresAt: new Date(Date.now() + 60_000),
  })
  const [payloadB64] = token.split('.')
  const forged = `${payloadB64}.not-a-real-signature`
  assert.equal(verifyPasswordResetToken(forged, { secret: SECRET }), null)
})

test('password reset token rejects expired', () => {
  const token = createPasswordResetToken({
    athleteId: 'ath-123',
    secret: SECRET,
    expiresAt: new Date(Date.now() - 1000),
  })
  assert.equal(verifyPasswordResetToken(token, { secret: SECRET }), null)
})
