import { describe, expect, it } from 'vitest'
import { eventSchema } from '../server/routes/events.js'
import { validateAdminEventDraft } from '../src/lib/schemas/adminEvent.js'

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
    expect(result.data.requiresMembership).toBe(true)
  })

  it('acepta requiresMembership false y default true si falta', () => {
    const withoutField = eventSchema.safeParse(validEvent())
    const withFalse = eventSchema.safeParse(validEvent({ requiresMembership: false }))

    expect(withoutField.success).toBe(true)
    expect(withoutField.data.requiresMembership).toBe(true)
    expect(withFalse.success).toBe(true)
    expect(withFalse.data.requiresMembership).toBe(false)
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

describe('validateAdminEventDraft del editor', () => {
  const t = (key) => key

  function validDraft(overrides = {}) {
    return {
      title: 'Pitbull Classic',
      slots: 120,
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'proximamente',
      startsAt: '2026-08-15T09:00',
      endsAt: '2026-08-15T20:00',
      pricing: { membership: 38000, registration: 45000, combo: 78000 },
      ...overrides,
    }
  }

  it('acepta un draft completo', () => {
    expect(validateAdminEventDraft(validDraft(), t).ok).toBe(true)
  })

  // startsAt/endsAt pasaron de opcionales a requeridos: eran opcionales acá pero
  // obligatorios en el backend, así que un evento sin horario pasaba la
  // validación del editor y lo rechazaba la API. Además convivían con un
  // `dateISO` aparte que podía contradecirlos.
  it('exige inicio y fin, que antes eran opcionales', () => {
    const missingStart = validateAdminEventDraft(validDraft({ startsAt: '' }), t)
    const missingEnd = validateAdminEventDraft(validDraft({ endsAt: '' }), t)

    expect(missingStart.ok).toBe(false)
    expect(missingStart.fieldErrors.startsAt).toBe(
      'admin.eventEditor.validation.startsAtRequired',
    )
    expect(missingEnd.ok).toBe(false)
    expect(missingEnd.fieldErrors.endsAt).toBe('admin.eventEditor.validation.endsAtRequired')
  })

  it('ya no pide dateISO por separado: el inicio es la única fuente de fecha', () => {
    expect(validateAdminEventDraft(validDraft({ dateISO: '' }), t).ok).toBe(true)
  })

  it('rechaza un fin anterior al inicio', () => {
    const result = validateAdminEventDraft(
      validDraft({ startsAt: '2026-08-15T20:00', endsAt: '2026-08-15T09:00' }),
      t,
    )

    expect(result.ok).toBe(false)
    expect(result.fieldErrors.endsAt).toBe('admin.eventEditor.validation.endsBeforeStarts')
  })
})
