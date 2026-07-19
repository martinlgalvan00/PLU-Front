import { describe, expect, it } from 'vitest'
import { createAccessToken, verifyAccessToken } from '../server/services/securityAccessToken.js'

const SECRET = 'un-secreto-de-prueba-largo-y-aleatorio'

function tokenFor({ userId = 'usr-1', eventId = 'evt-1', ttlMs = 60_000 } = {}) {
  return createAccessToken({
    userId,
    eventId,
    expiresAt: new Date(Date.now() + ttlMs),
    secret: SECRET,
  })
}

describe('securityAccessToken', () => {
  it('firma y verifica un token válido devolviendo el payload', () => {
    const token = tokenFor({ userId: 'usr-9', eventId: 'evt-9' })
    const payload = verifyAccessToken(token, { secret: SECRET })

    expect(payload).toMatchObject({ uid: 'usr-9', eid: 'evt-9' })
    expect(typeof payload.exp).toBe('number')
  })

  it('rechaza un token con la firma alterada', () => {
    const token = tokenFor()
    const [payloadB64] = token.split('.')
    const tampered = `${payloadB64}.firmafalsa`

    expect(verifyAccessToken(tampered, { secret: SECRET })).toBeNull()
  })

  it('rechaza un token con el payload alterado (no matchea la firma)', () => {
    const token = tokenFor({ userId: 'usr-1' })
    const forgedPayload = Buffer.from(JSON.stringify({ uid: 'usr-admin', eid: 'evt-1', exp: 9_999_999_999 }))
      .toString('base64url')
    const tampered = `${forgedPayload}.${token.split('.')[1]}`

    expect(verifyAccessToken(tampered, { secret: SECRET })).toBeNull()
  })

  it('rechaza un token firmado con otro secreto', () => {
    const token = tokenFor()
    expect(verifyAccessToken(token, { secret: 'otro-secreto' })).toBeNull()
  })

  it('rechaza un token vencido', () => {
    const token = tokenFor({ ttlMs: -1000 })
    expect(verifyAccessToken(token, { secret: SECRET })).toBeNull()
  })

  it('rechaza basura sin formato de token', () => {
    expect(verifyAccessToken('no-es-un-token', { secret: SECRET })).toBeNull()
    expect(verifyAccessToken('', { secret: SECRET })).toBeNull()
  })
})
