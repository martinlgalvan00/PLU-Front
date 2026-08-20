import { describe, expect, it } from 'vitest'
import { isPaymentRecoveryJobEnabled } from '../server/modules/payments/paymentRuntimeDefaults.js'

describe('payment runtime defaults', () => {
  it('mantiene apagado el worker residente salvo habilitacion explicita', () => {
    expect(isPaymentRecoveryJobEnabled({})).toBe(false)
    expect(isPaymentRecoveryJobEnabled({ PAYMENT_RECOVERY_JOB_ENABLED: 'false' })).toBe(false)
    expect(isPaymentRecoveryJobEnabled({ PAYMENT_RECOVERY_JOB_ENABLED: 'true' })).toBe(true)
    expect(isPaymentRecoveryJobEnabled({ PAYMENT_RECOVERY_JOB_ENABLED: ' TRUE ' })).toBe(true)
  })
})
