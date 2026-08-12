import { describe, expect, it } from 'vitest'
import {
  formatRegistrationOpenMoment,
  isPaidCheckoutOpen,
  resolveFutureLaunchAt,
  resolveLaunchOpenAt,
} from '../src/lib/registrationSchedule.js'

describe('registrationSchedule', () => {
  const now = new Date('2026-08-12T12:00:00-03:00')

  it('resuelve el countdown solo desde registrationOpensAt del admin', () => {
    expect(resolveLaunchOpenAt({
      event: { registrationOpensAt: '2026-08-14T10:00:00-03:00' },
    })).toBe('2026-08-14T10:00:00-03:00')

    expect(resolveLaunchOpenAt({
      targetDate: '2026-08-20T09:00:00-03:00',
      event: { registrationOpensAt: '2026-08-14T10:00:00-03:00' },
    })).toBe('2026-08-20T09:00:00-03:00')

    expect(resolveLaunchOpenAt({ event: {} })).toBeNull()
  })

  it('elige fecha futura de marketing y cae al fallback si la del admin ya pasó', () => {
    expect(resolveFutureLaunchAt(
      { registrationOpensAt: '2026-08-14T10:00:00-03:00' },
      { now },
    )).toBe('2026-08-14T10:00:00-03:00')

    expect(resolveFutureLaunchAt(
      { registrationOpensAt: '2026-08-01T10:00:00-03:00' },
      { fallback: '2026-09-01T10:00:00-03:00', now },
    )).toBe('2026-09-01T10:00:00-03:00')

    expect(resolveFutureLaunchAt(
      { registrationOpensAt: '2026-08-01T10:00:00-03:00' },
      { fallback: '2026-07-01T10:00:00-03:00', now },
    )).toBeNull()
  })

  it('formatea datetime ISO sin devolver el string crudo', () => {
    const moment = formatRegistrationOpenMoment('2026-08-14T10:00:00-03:00', 'es')
    expect(moment).not.toBeNull()
    expect(moment.day.toLowerCase()).toContain('agosto')
    expect(moment.day).toContain('2026')
    expect(moment.time).toMatch(/10:00/)
    expect(moment.day).not.toContain('T10:00')
  })

  it('abre cobros en produccion cuando pasa la fecha del admin', () => {
    const event = { registrationOpensAt: '2026-08-14T10:00:00-03:00', status: 'proximamente' }
    expect(isPaidCheckoutOpen(event, { appProduction: true }, now)).toBe(false)
    expect(isPaidCheckoutOpen(
      event,
      { appProduction: true },
      new Date('2026-08-14T10:00:00-03:00'),
    )).toBe(true)
  })

  it('en produccion no abre cobros solo por status sin registrationOpensAt', () => {
    const event = { status: 'inscripcion_abierta', slug: 'pitbull-classic-2026' }
    expect(isPaidCheckoutOpen(event, { appProduction: true }, now)).toBe(false)
    expect(isPaidCheckoutOpen(event, { appProduction: false }, now)).toBe(true)
  })

  it('respeta kill switch PAID_CHECKOUT_ENABLED', () => {
    const event = { registrationOpensAt: '2026-08-14T10:00:00-03:00' }
    expect(isPaidCheckoutOpen(event, { appProduction: true, paidCheckoutEnabled: true }, now)).toBe(true)
    expect(isPaidCheckoutOpen(event, {
      appProduction: false,
      paidCheckoutEnabled: false,
    }, now)).toBe(false)
  })
})
