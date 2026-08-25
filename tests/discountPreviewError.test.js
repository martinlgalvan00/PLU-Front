import { describe, expect, it, vi } from 'vitest'
import { describeDiscountPreviewError } from '../src/lib/discountPreviewError.js'

describe('describeDiscountPreviewError', () => {
  const t = vi.fn((key, params) => (params?.event ? `${key}:${params.event}` : key))

  it('nombra el evento cuando el código es de otra inscripción', () => {
    expect(
      describeDiscountPreviewError(
        t,
        { reason: 'other_event', eventTitle: 'Pitbull Classic' },
        'pages.register.discountError',
      ),
    ).toBe('pages.register.discountError.other_event_named:Pitbull Classic')
  })

  it('explica el alcance cuando not_applicable trae appliesTo', () => {
    expect(
      describeDiscountPreviewError(
        t,
        { reason: 'not_applicable', appliesTo: 'combo' },
        'account.membership.discountError',
      ),
    ).toBe('account.membership.discountError.not_applicable_combo')
  })

  it('cae al motivo genérico si no hay alcance', () => {
    expect(
      describeDiscountPreviewError(t, { reason: 'not_applicable' }, 'pages.register.discountError'),
    ).toBe('pages.register.discountError.not_applicable')
  })
})
