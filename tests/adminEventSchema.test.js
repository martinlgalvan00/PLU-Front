import { describe, expect, it } from 'vitest'
import { eventSchema } from '../server/routes/events.js'

function validEvent(overrides = {}) {
  return {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    startsAt: '2026-08-15T09:00',
    endsAt: '2026-08-15T20:00',
    status: 'proximamente',
    published: false,
    slots: 120,
    featured: true,
    pricing: {
      membership: 38000,
      registration: 45000,
      combo: 78000,
      ticketsEnabled: true,
      ticketAddons: [{ id: 'food', label: 'Comida', price: 12000 }],
    },
    eventDays: [{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }],
    ticketTypes: [
      {
        name: 'Pase general',
        price: 20000,
        quota: 100,
        dayIndexes: [0],
        includedAddonIds: ['food'],
      },
    ],
    ...overrides,
  }
}

describe('eventSchema del backend', () => {
  it('normaliza números y acepta un evento completo', () => {
    const result = eventSchema.safeParse(validEvent({ slots: '120' }))

    expect(result.success).toBe(true)
    expect(result.data.slots).toBe(120)
  })

  it('rechaza una fecha final anterior al inicio', () => {
    const result = eventSchema.safeParse(
      validEvent({ startsAt: '2026-08-15T20:00', endsAt: '2026-08-15T09:00' }),
    )

    expect(result.success).toBe(false)
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'endsAt')).toBe(true)
  })

  it('rechaza jornadas duplicadas y referencias inexistentes', () => {
    const result = eventSchema.safeParse(
      validEvent({
        eventDays: [
          { dayIndex: 0, label: 'Día 1' },
          { dayIndex: 0, label: 'Otra jornada' },
        ],
        ticketTypes: [
          {
            name: 'Pase inválido',
            price: 20000,
            dayIndexes: [3],
            includedAddonIds: ['missing'],
          },
        ],
      }),
    )

    expect(result.success).toBe(false)
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['eventDays', 'ticketTypes']),
    )
  })
})
