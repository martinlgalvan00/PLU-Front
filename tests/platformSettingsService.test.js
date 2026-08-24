import { describe, expect, it } from 'vitest'
import { channelOpen } from '../src/lib/paymentChannels.js'
import { normalizePublicCheckoutAvailability } from '../src/services/platformSettingsService.js'

describe('platformSettingsService', () => {
  it('preserva la matriz publica de canales de pago', () => {
    const availability = normalizePublicCheckoutAvailability({
      membershipEnabled: true,
      paymentChannels: {
        membership: {
          mercado_pago: true,
          bank_transfer: false,
          cash_pitbull: false,
          wise_transfer: true,
        },
      },
    })

    expect(channelOpen(availability, 'membership', 'mercado_pago')).toBe(true)
    expect(channelOpen(availability, 'membership', 'bank_transfer')).toBe(false)
    expect(channelOpen(availability, 'membership', 'wise_transfer')).toBe(true)
  })

  it('mantiene Wise cerrado por default si el backend no envia la celda', () => {
    const availability = normalizePublicCheckoutAvailability({})

    expect(channelOpen(availability, 'membership', 'mercado_pago')).toBe(true)
    expect(channelOpen(availability, 'membership', 'wise_transfer')).toBe(false)
  })
})
