import { describe, expect, it } from 'vitest'
import {
  formatRegistrationOpenMoment,
  isPaidCheckoutOpen,
  resolveFutureLaunchAt,
  resolveLaunchOpenAt,
} from '../src/lib/registrationSchedule.js'

describe('registrationSchedule', () => {
  const now = new Date('2026-08-12T12:00:00-03:00')

  it('resuelve el countdown desde registrationOpensAt', () => {
    expect(
      resolveLaunchOpenAt({ event: { registrationOpensAt: '2026-08-14T10:00:00-03:00' } }),
    ).toBe('2026-08-14T10:00:00-03:00')
    expect(resolveLaunchOpenAt({ event: {} })).toBeNull()
  })

  it('elige fecha futura de marketing', () => {
    expect(
      resolveFutureLaunchAt({ registrationOpensAt: '2026-08-14T10:00:00-03:00' }, { now }),
    ).toBe('2026-08-14T10:00:00-03:00')
  })

  it('formatea datetime ISO sin devolver el string crudo', () => {
    const moment = formatRegistrationOpenMoment('2026-08-14T10:00:00-03:00', 'es')
    expect(moment.day.toLowerCase()).toContain('agosto')
    expect(moment.time).toMatch(/10:00/)
  })

  it('abre checkout por defecto y respeta el kill switch explícito', () => {
    const event = { registrationOpensAt: '2026-08-14T10:00:00-03:00' }
    expect(isPaidCheckoutOpen(event, {}, now)).toBe(true)
    expect(isPaidCheckoutOpen(event, { paidCheckoutEnabled: true }, now)).toBe(true)
    expect(isPaidCheckoutOpen(event, { paidCheckoutEnabled: false }, now)).toBe(false)
  })
})
