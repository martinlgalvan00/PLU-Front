import { describe, expect, it } from 'vitest'
import {
  isProofEligibleForPurge,
  proofDecisionAt,
  resolveProofRetentionHours,
} from '../server/modules/payments/paymentProofRetention.js'

describe('paymentProofRetention', () => {
  const now = new Date('2026-08-29T15:00:00.000Z')

  it('resuelve retención por defecto y acota el techo', () => {
    expect(resolveProofRetentionHours({})).toBe(24)
    expect(resolveProofRetentionHours({ PROOF_RETENTION_HOURS: '48' })).toBe(48)
    expect(resolveProofRetentionHours({ PROOF_RETENTION_HOURS: '9999' })).toBe(24 * 30)
    expect(resolveProofRetentionHours({ PROOF_RETENTION_HOURS: '0' })).toBe(24)
  })

  it('ancla en approved_at / rejected_at según status', () => {
    expect(
      proofDecisionAt({
        status: 'aprobado',
        approved_at: '2026-08-28T12:00:00.000Z',
        rejected_at: '2026-08-27T12:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-08-28T12:00:00.000Z')

    expect(
      proofDecisionAt({
        status: 'rechazado',
        approved_at: null,
        rejected_at: '2026-08-24T03:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-08-24T03:00:00.000Z')
  })

  it('no purga pendientes ni órdenes sin path', () => {
    expect(
      isProofEligibleForPurge(
        {
          status: 'pendiente',
          payment_proof_path: 'a/b.jpg',
          approved_at: null,
          rejected_at: null,
        },
        { now, retentionHours: 24 },
      ),
    ).toBe(false)

    expect(
      isProofEligibleForPurge(
        {
          status: 'aprobado',
          payment_proof_path: null,
          approved_at: '2026-08-20T12:00:00.000Z',
        },
        { now, retentionHours: 24 },
      ),
    ).toBe(false)
  })

  it('purga recién después de la retención post-decisión', () => {
    const base = {
      status: 'aprobado',
      payment_proof_path: 'order/proof.jpg',
      payment_proof_purged_at: null,
      approved_at: '2026-08-29T00:00:00.000Z',
    }

    expect(isProofEligibleForPurge(base, { now, retentionHours: 24 })).toBe(false)
    expect(
      isProofEligibleForPurge(
        { ...base, approved_at: '2026-08-28T14:59:00.000Z' },
        { now, retentionHours: 24 },
      ),
    ).toBe(true)
  })

  it('no vuelve a purgar si ya tiene purged_at', () => {
    expect(
      isProofEligibleForPurge(
        {
          status: 'rechazado',
          payment_proof_path: 'x/y.jpg',
          payment_proof_purged_at: '2026-08-25T00:00:00.000Z',
          rejected_at: '2026-08-20T00:00:00.000Z',
        },
        { now, retentionHours: 24 },
      ),
    ).toBe(false)
  })
})
