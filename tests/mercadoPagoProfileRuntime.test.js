import { describe, expect, it } from 'vitest'
import { HttpError } from '../server/lib/errors.js'
import {
  decryptPaymentProfileSecrets,
  encryptPaymentProfileSecrets,
  isPaymentProfileSecretsKeyConfigured,
} from '../server/modules/payments/paymentProfileSecrets.js'
import {
  credentialsFromMercadoPagoProfile,
  pickWebhookCredentials,
} from '../server/modules/payments/mercadoPagoProfileRuntime.js'

const TEST_ENV = {
  PAYMENT_PROFILE_SECRETS_KEY: 'a'.repeat(64),
}

describe('paymentProfileSecrets', () => {
  it('cifra y descifra round-trip', () => {
    const secrets = { accessToken: 'APP_USR-token', webhookSecret: 'whsec-abc' }
    const ciphertext = encryptPaymentProfileSecrets(secrets, TEST_ENV)
    expect(ciphertext.startsWith('v1:')).toBe(true)
    expect(decryptPaymentProfileSecrets(ciphertext, TEST_ENV)).toEqual(secrets)
  })

  it('falla sin clave configurada', () => {
    expect(isPaymentProfileSecretsKeyConfigured({})).toBe(false)
    expect(() => encryptPaymentProfileSecrets({ accessToken: 'x' }, {})).toThrow(HttpError)
  })
})

describe('credentialsFromMercadoPagoProfile', () => {
  it('devuelve null sin perfil', () => {
    expect(credentialsFromMercadoPagoProfile(null, TEST_ENV)).toBeNull()
  })

  it('arma credenciales desde config + ciphertext', () => {
    const secrets = { accessToken: 'APP_USR-1', webhookSecret: 'wh-1' }
    const profile = {
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'mercado_pago',
      config: { publicKey: 'TEST-pub', collectorId: '42' },
      secretsCiphertext: encryptPaymentProfileSecrets(secrets, TEST_ENV),
    }
    expect(credentialsFromMercadoPagoProfile(profile, TEST_ENV)).toEqual({
      profileId: profile.id,
      accessToken: 'APP_USR-1',
      webhookSecret: 'wh-1',
      publicKey: 'TEST-pub',
      collectorId: '42',
    })
  })
})

describe('pickWebhookCredentials', () => {
  it('elige el secreto que verifica', () => {
    const secrets = [
      { secret: 'wrong', profileId: 'a' },
      { secret: 'right', profileId: 'b' },
    ]
    const matched = pickWebhookCredentials(secrets, (secret) => {
      if (secret !== 'right') {
        const error = new HttpError(401, 'bad')
        throw error
      }
    })
    expect(matched.profileId).toBe('b')
  })
})
