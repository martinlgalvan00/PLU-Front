import { describe, expect, it } from 'vitest'
import {
  buildAdminEventDraft,
  createAdminEventDraft,
  filterAdminEvents,
  mapDraftToPreviewEvent,
  mapSupabaseEventRow,
} from '../src/services/eventAdminService.js'

describe('eventAdminService', () => {
  it('crea drafts independientes para no compartir arrays ni pricing', () => {
    const first = createAdminEventDraft()
    const second = createAdminEventDraft()

    first.eventDays.push({ dayIndex: 0, label: 'Día 1' })
    first.pricing.ticketAddons.push({ id: 'food', label: 'Comida', price: 1000 })

    expect(second.eventDays).toEqual([])
    expect(second.pricing.ticketAddons).toEqual([])
    expect(first.requiresMembership).toBe(true)
  })

  it('conserva la identidad y versión del backend al abrir una edición', () => {
    const draft = buildAdminEventDraft({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      dateISO: '2026-08-15',
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'inscripcion_abierta',
      featured: true,
      slots: 120,
      startsAt: '2026-08-15T12:00:00.000Z',
      endsAt: '2026-08-15T20:00:00.000Z',
      updatedAt: '2026-07-26T12:00:00.000Z',
      pricing: { membership: 38000, registration: 45000, combo: 78000 },
      eventDays: [{ id: 'day-1', dayIndex: 0, label: 'Día 1' }],
      ticketTypes: [],
      published: true,
      requiresMembership: false,
    })

    expect(draft).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'pitbull-classic-2026',
      expectedUpdatedAt: '2026-07-26T12:00:00.000Z',
      published: true,
      requiresMembership: false,
    })
    expect(draft.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(mapDraftToPreviewEvent({ ...draft, title: 'Título nuevo' }).slug).toBe(
      'pitbull-classic-2026',
    )
  })

  it('mapea el conteo real de inscripciones y el catálogo anidado', () => {
    const event = mapSupabaseEventRow({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'Maximal',
      location: 'Buenos Aires',
      starts_at: '2026-08-15T12:00:00.000Z',
      ends_at: '2026-08-15T20:00:00.000Z',
      capacity: 120,
      status: 'proximamente',
      published: false,
      price: 45000,
      currency: 'ARS',
      rules: {},
      eventRegistrations: [{ count: 48 }],
      eventDays: [{ id: 'day-1', day_index: 0, label: 'Día 1', date: '2026-08-15' }],
      ticketTypes: [],
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-26T12:00:00.000Z',
    })

    expect(event).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      registered: 48,
      slots: 120,
      updatedAt: '2026-07-26T12:00:00.000Z',
    })
    expect(event.eventDays).toEqual([
      { id: 'day-1', dayIndex: 0, label: 'Día 1', date: '2026-08-15' },
    ])
  })

  it('filtra sin romperse ante datos parciales del backend', () => {
    const events = [
      { id: 'one', title: 'Open', venue: null, location: null, slug: null, status: 'proximamente' },
    ]

    expect(filterAdminEvents(events, { query: 'open' })).toHaveLength(1)
    expect(filterAdminEvents(events, { query: 'maximal' })).toHaveLength(0)
  })
})
