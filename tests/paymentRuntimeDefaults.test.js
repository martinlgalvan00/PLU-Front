import { describe, expect, it } from 'vitest'
import {
  isPaymentRecoveryJobEnabled,
  isPaymentRevalidationJobEnabled,
} from '../server/modules/payments/paymentRuntimeDefaults.js'

describe('payment runtime defaults', () => {
  it('mantiene apagado el worker residente salvo habilitacion explicita', () => {
    expect(isPaymentRecoveryJobEnabled({})).toBe(false)
    expect(isPaymentRecoveryJobEnabled({ PAYMENT_RECOVERY_JOB_ENABLED: 'false' })).toBe(false)
    expect(isPaymentRecoveryJobEnabled({ PAYMENT_RECOVERY_JOB_ENABLED: 'true' })).toBe(true)
    expect(isPaymentRecoveryJobEnabled({ PAYMENT_RECOVERY_JOB_ENABLED: ' TRUE ' })).toBe(true)
  })

  it('mantiene apagado el barrido residente de revalidacion salvo habilitacion explicita', () => {
    expect(isPaymentRevalidationJobEnabled({})).toBe(false)
    expect(isPaymentRevalidationJobEnabled({ PAYMENT_REVALIDATION_JOB_ENABLED: 'false' })).toBe(
      false,
    )
    expect(isPaymentRevalidationJobEnabled({ PAYMENT_REVALIDATION_JOB_ENABLED: 'true' })).toBe(
      true,
    )
    expect(isPaymentRevalidationJobEnabled({ PAYMENT_REVALIDATION_JOB_ENABLED: ' TRUE ' })).toBe(
      true,
    )
  })
})
