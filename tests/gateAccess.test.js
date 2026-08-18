import { describe, expect, it } from 'vitest'
import {
  findGatePendingRegistrations,
  getRegistrationGateLabelKey,
  isRegistrationGatePending,
  resolveRequiresMembership,
} from '../src/lib/gateAccess.js'

const EVENTS = [
  { slug: 'pitbull-classic-2026', title: 'Pitbull Classic', requiresMembership: true },
  { slug: 'spring-classic-2025', title: 'Spring Classic 2025', requiresMembership: false },
]

describe('gateAccess', () => {
  it('resuelve requiresMembership desde la inscripción o el catálogo', () => {
    expect(resolveRequiresMembership({ requiresMembership: false }, EVENTS)).toBe(false)
    expect(resolveRequiresMembership({ eventSlug: 'pitbull-classic-2026' }, EVENTS)).toBe(true)
    expect(resolveRequiresMembership({ event: 'Spring Classic 2025' }, EVENTS)).toBe(false)
  })

  it('marca gate pending solo con inscripción admitida + meet que exige afiliación', () => {
    expect(
      isRegistrationGatePending(
        { status: 'confirmada', eventSlug: 'pitbull-classic-2026' },
        { membershipCurrent: false, events: EVENTS },
      ),
    ).toBe(true)

    expect(
      isRegistrationGatePending(
        { status: 'confirmada', eventSlug: 'pitbull-classic-2026' },
        { membershipCurrent: true, events: EVENTS },
      ),
    ).toBe(false)

    expect(
      isRegistrationGatePending(
        { status: 'confirmada', eventSlug: 'spring-classic-2025' },
        { membershipCurrent: false, events: EVENTS },
      ),
    ).toBe(false)

    expect(
      isRegistrationGatePending(
        { status: 'pendiente_pago', eventSlug: 'pitbull-classic-2026' },
        { membershipCurrent: false, events: EVENTS },
      ),
    ).toBe(false)
  })

  it('elige el copy Cupo reservado vs Listo para ingresar', () => {
    expect(
      getRegistrationGateLabelKey(
        { status: 'confirmada', eventSlug: 'pitbull-classic-2026' },
        { membershipCurrent: false, events: EVENTS },
      ),
    ).toBe('account.qr.gateReserved')

    expect(
      getRegistrationGateLabelKey(
        { status: 'confirmada', eventSlug: 'pitbull-classic-2026' },
        { membershipCurrent: true, events: EVENTS },
      ),
    ).toBe('account.qr.gateReady')
  })

  it('lista inscripciones gate-pending por atleta', () => {
    const pending = findGatePendingRegistrations(
      [
        {
          id: 'r1',
          athleteId: 'a1',
          status: 'confirmada',
          eventSlug: 'pitbull-classic-2026',
          event: 'Pitbull Classic',
        },
        {
          id: 'r2',
          athleteId: 'a1',
          status: 'confirmada',
          eventSlug: 'spring-classic-2025',
          event: 'Spring Classic 2025',
        },
      ],
      {
        athleteId: 'a1',
        memberships: [{ athleteId: 'a1', status: 'pendiente_pago' }],
        events: EVENTS,
      },
    )

    expect(pending.map((item) => item.id)).toEqual(['r1'])
  })
})
