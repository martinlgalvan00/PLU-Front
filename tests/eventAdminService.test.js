import { describe, expect, it } from 'vitest'
import {
  buildAdminEventDraft,
  createAdminEventDraft,
  filterAdminEvents,
  getEventRegistrationAvailability,
  getInitialAdminEvents,
  getEventConsistencyWarnings,
  mapDraftToPreviewEvent,
  mapSupabaseEventRow,
  removeAdminEvent,
  withEventStart,
} from '../src/services/eventAdminService.js'

describe('eventAdminService', () => {
  it('ignora un precio viejo de localStorage en el runtime conectado', () => {
    const events = getInitialAdminEvents(
      [
        {
          slug: 'pitbull-classic-2026',
          title: 'Pitbull Classic viejo',
          price: 2,
          pricing: { registration: 2, membership: 2, combo: 2 },
        },
      ],
      { allowStoredEvents: false },
    )

    const pitbull = events.find((event) => event.slug === 'pitbull-classic-2026')
    expect(pitbull.price).toBe(75000)
    expect(pitbull.pricing.registration).toBe(75000)
    expect(pitbull.slots).toBe(180)
  })

  it('conserva el catálogo local solamente para el modo demo', () => {
    const events = getInitialAdminEvents(
      [
        {
          slug: 'pitbull-classic-2026',
          title: 'Pitbull demo',
          price: 2,
          pricing: { registration: 2, membership: 2, combo: 2 },
        },
      ],
      { allowStoredEvents: true },
    )

    expect(events.find((event) => event.slug === 'pitbull-classic-2026').price).toBe(2)
  })

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
      description: 'Fecha nacional con dos plataformas.',
      dateISO: '2026-08-15',
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'inscripcion_abierta',
      featured: true,
      slots: 120,
      startsAt: '2026-08-15T12:00:00.000Z',
      endsAt: '2026-08-15T20:00:00.000Z',
      updatedAt: '2026-07-26T12:00:00.000Z',
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
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
      description: 'Fecha nacional con dos plataformas.',
    })
    expect(draft.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(mapDraftToPreviewEvent({ ...draft, title: 'Título nuevo' }).slug).toBe(
      'pitbull-classic-2026',
    )
  })

  it('cuenta solo las inscripciones que ocupan cupo y mapea el catálogo anidado', () => {
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
      price: 75000,
      currency: 'ARS',
      rules: {},
      // Mezcla deliberada: solo pendiente_pago/pagada/confirmada bloquean cupo
      // en create_competition_registration_v2 — cancelada y borrador no.
      eventRegistrations: [
        ...Array.from({ length: 20 }, () => ({ status: 'confirmada' })),
        ...Array.from({ length: 18 }, () => ({ status: 'pagada' })),
        ...Array.from({ length: 10 }, () => ({ status: 'pendiente_pago' })),
        ...Array.from({ length: 3 }, () => ({ status: 'cancelada' })),
        ...Array.from({ length: 2 }, () => ({ status: 'borrador' })),
      ],
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

  it('usa el count agregado del catálogo público sin traer filas de inscripciones', () => {
    const event = mapSupabaseEventRow({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'Maximal',
      location: 'Buenos Aires',
      starts_at: '2026-08-15T12:00:00.000Z',
      ends_at: '2026-08-15T20:00:00.000Z',
      capacity: 120,
      price: 75000,
      currency: 'ARS',
      rules: {},
      eventRegistrations: [{ count: 48 }],
      eventDays: [],
      ticketTypes: [],
    })

    expect(event.registered).toBe(48)
  })

  it('filtra sin romperse ante datos parciales del backend', () => {
    const events = [
      { id: 'one', title: 'Open', venue: null, location: null, slug: null, status: 'proximamente' },
    ]

    expect(filterAdminEvents(events, { query: 'open' })).toHaveLength(1)
    expect(filterAdminEvents(events, { query: 'maximal' })).toHaveLength(0)
  })
})

describe('withEventStart', () => {
  it('deriva dateISO del inicio para que no puedan contradecirse', () => {
    const draft = withEventStart({ dateISO: '2026-01-01' }, '2026-08-15T09:00')

    expect(draft).toMatchObject({ startsAt: '2026-08-15T09:00', dateISO: '2026-08-15' })
  })

  it('limpia dateISO cuando se borra el inicio', () => {
    expect(withEventStart({ dateISO: '2026-08-15' }, '')).toMatchObject({
      startsAt: '',
      dateISO: '',
    })
  })
})

describe('getEventConsistencyWarnings', () => {
  const now = new Date('2026-08-01T12:00:00')

  function draft(overrides = {}) {
    return {
      status: 'inscripcion_abierta',
      slots: 120,
      startsAt: '2026-09-15T09:00',
      endsAt: '2026-09-15T20:00',
      pricing: { ticketsEnabled: false },
      ...overrides,
    }
  }

  it('no advierte nada cuando el estado coincide con la configuración', () => {
    expect(
      getEventConsistencyWarnings(
        draft({
          registrationOpensAt: '2026-07-01T00:00',
          registrationClosesAt: '2026-09-01T00:00',
        }),
        { registered: 40 },
        now,
      ),
    ).toEqual([])
  })

  it('detecta inscripción abierta con la ventana ya vencida', () => {
    expect(
      getEventConsistencyWarnings(draft({ registrationClosesAt: '2026-07-15T00:00' }), null, now),
    ).toContain('registrationClosedButOpenStatus')
  })

  it('detecta inscripción abierta antes de la fecha de apertura', () => {
    expect(
      getEventConsistencyWarnings(draft({ registrationOpensAt: '2026-08-20T00:00' }), null, now),
    ).toContain('registrationNotYetOpen')
  })

  it('detecta evento cerrado con la ventana de inscripción todavía vigente', () => {
    expect(
      getEventConsistencyWarnings(
        draft({
          status: 'cerrado',
          registrationOpensAt: '2026-07-01T00:00',
          registrationClosesAt: '2026-09-01T00:00',
        }),
        null,
        now,
      ),
    ).toContain('registrationOpenButClosedStatus')
  })

  it('detecta cupo lleno con el estado todavía en inscripción abierta', () => {
    expect(getEventConsistencyWarnings(draft(), { registered: 120 }, now)).toContain(
      'slotsFullButOpenStatus',
    )
  })

  it('detecta venta de entradas habilitada con el cierre ya pasado', () => {
    expect(
      getEventConsistencyWarnings(
        draft({
          pricing: { ticketsEnabled: true },
          ticketSalesClosesAt: '2026-07-20T00:00',
        }),
        null,
        now,
      ),
    ).toContain('ticketSalesClosedButEnabled')
  })

  it('detecta evento finalizado antes de su fecha de fin', () => {
    expect(getEventConsistencyWarnings(draft({ status: 'finalizado' }), null, now)).toContain(
      'finishedButNotEnded',
    )
  })
})

describe('getEventRegistrationAvailability', () => {
  const now = new Date('2026-08-01T12:00:00.000Z')

  it('considera habilitada una inscripción sólo cuando estado, publicación y ventana coinciden', () => {
    const availability = getEventRegistrationAvailability(
      {
        status: 'inscripcion_abierta',
        published: true,
        slots: 120,
        registered: 32,
        registrationOpensAt: '2026-07-01T00:00:00.000Z',
        registrationClosesAt: '2026-09-01T00:00:00.000Z',
      },
      now,
    )

    expect(availability.isLive).toBe(true)
    expect(availability.canOpen).toBe(false)
  })

  it('no habilita desde el atajo si la ventana todavía no abrió o ya venció', () => {
    const scheduled = getEventRegistrationAvailability(
      {
        status: 'proximamente',
        published: true,
        slots: 120,
        registered: 0,
        registrationOpensAt: '2026-08-10T00:00:00.000Z',
      },
      now,
    )
    const expired = getEventRegistrationAvailability(
      {
        status: 'proximamente',
        published: true,
        slots: 120,
        registered: 0,
        registrationClosesAt: '2026-07-31T00:00:00.000Z',
      },
      now,
    )

    expect(scheduled).toMatchObject({ scheduled: true, canOpen: false, isLive: false })
    expect(expired).toMatchObject({ closedByWindow: true, canOpen: false, isLive: false })
  })

  it('no intenta reabrir un evento agotado aunque el conteo local sea parcial', () => {
    const availability = getEventRegistrationAvailability(
      { status: 'agotado', published: true, slots: 120, registered: 0 },
      now,
    )

    expect(availability).toMatchObject({ full: true, canOpen: false, isLive: false })
  })

  it('permite abrir un próximo evento si está publicado o todavía oculto', () => {
    const availability = getEventRegistrationAvailability(
      { status: 'proximamente', published: false, slots: 120, registered: 0 },
      now,
    )

    expect(availability).toMatchObject({ canOpen: true, canSetUpcoming: true })
  })
})

describe('removeAdminEvent', () => {
  const events = [
    { id: 'evt-1', slug: 'pitbull-classic-2026', title: 'Pitbull Classic' },
    { id: 'evt-2', slug: 'nacional-2026', title: 'Nacional' },
  ]

  it('saca el evento de la colección y deja el registro de auditoría', () => {
    const result = removeAdminEvent(events, 'evt-1')

    expect(result.event).toMatchObject({ id: 'evt-1' })
    expect(result.events.map((event) => event.id)).toEqual(['evt-2'])
    expect(result.auditLog).toMatchObject({ action: 'event.deleted', entityId: 'evt-1' })
  })

  it('no toca la colección si el evento ya no está', () => {
    const result = removeAdminEvent(events, 'evt-inexistente')

    expect(result.event).toBeNull()
    expect(result.events).toBe(events)
    expect(result.auditLog).toBeNull()
  })
})
