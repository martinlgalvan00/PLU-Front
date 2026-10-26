import { describe, expect, it } from 'vitest'
import { resolveEventPublishReadiness } from '../src/lib/eventPublishReadiness.js'
import { buildAdminEventDraft, mapSupabaseEventRow } from '../src/services/eventAdminService.js'
import { normalizeEventOffering } from '../shared/eventOffering.js'

const NOW = new Date('2026-06-01T12:00:00')

const complete = () => ({
  title: 'Pitbull Classic',
  description: 'Un meet de fuerza abierto a todo el país.',
  venue: 'Club Atlético',
  location: 'Rosario',
  status: 'inscripcion_abierta',
  slots: 120,
  startsAt: '2026-09-10T09:00',
  endsAt: '2026-09-10T20:00',
  registrationOpensAt: '2026-06-02T09:00',
  registrationClosesAt: '2026-09-01T23:00',
  logoUrl: 'https://cdn.example/logo.png',
  salesIntent: 'announce',
  publicCopy: { ctaLabel: 'Anotarme' },
  pricing: { ticketsEnabled: false },
})

const run = (event, options = {}) => resolveEventPublishReadiness(event, { now: NOW, ...options })
const stateOf = (result, key) => result.items.find((item) => item.key === key)?.state

describe('resolveEventPublishReadiness', () => {
  it('un evento completo está listo y cuenta todo', () => {
    const result = run(complete())
    expect(result.items.map((item) => item.key)).toEqual([
      'title', 'dates', 'venue', 'capacity', 'offering', 'landingLead', 'landingCta',
      'image', 'registrationWindow', 'sales',
    ])
    expect(result.ready).toBe(true)
    expect(result.total).toBe(10)
    expect(result.doneCount).toBe(10)
    expect(new Set(result.items.map((item) => item.group))).toEqual(
      new Set(['basics', 'landing', 'registration', 'sales']),
    )
  })

  it('un evento vacío o nulo deja todo lo básico en todo y no está listo', () => {
    for (const input of [null, undefined, {}]) {
      const result = run(input)
      expect(result.ready).toBe(false)
      for (const key of ['title', 'dates', 'venue', 'capacity', 'landingLead', 'image']) {
        expect(stateOf(result, key)).toBe('todo')
      }
      expect(result.total).toBe(10)
    }
  })

  it('title: vacío o solo espacios es todo', () => {
    expect(stateOf(run({ ...complete(), title: '   ' }), 'title')).toBe('todo')
  })

  describe('dates', () => {
    it('falta inicio o fin, o el fin es anterior: todo', () => {
      expect(stateOf(run({ ...complete(), endsAt: '' }), 'dates')).toBe('todo')
      expect(stateOf(run({ ...complete(), startsAt: '' }), 'dates')).toBe('todo')
      expect(stateOf(run({ ...complete(), endsAt: '2026-09-09T20:00' }), 'dates')).toBe('todo')
    })
    it('fin igual al inicio es válido', () => {
      expect(stateOf(run({ ...complete(), endsAt: '2026-09-10T09:00' }), 'dates')).toBe('ok')
    })
    it('el inicio ya pasó: warning, no bloquea', () => {
      const result = run({ ...complete(), startsAt: '2026-05-01T09:00', endsAt: '2026-05-01T18:00', registrationClosesAt: '' })
      expect(stateOf(result, 'dates')).toBe('warning')
      expect(result.ready).toBe(true)
    })
  })

  it('venue: alcanza con sede o con ciudad', () => {
    expect(stateOf(run({ ...complete(), venue: '' }), 'venue')).toBe('ok')
    expect(stateOf(run({ ...complete(), location: '' }), 'venue')).toBe('ok')
    expect(stateOf(run({ ...complete(), venue: ' ', location: '' }), 'venue')).toBe('todo')
  })

  it('capacity: tiene que ser mayor a cero; acepta capacity de un evento mapeado', () => {
    expect(stateOf(run({ ...complete(), slots: 0 }), 'capacity')).toBe('todo')
    expect(stateOf(run({ ...complete(), slots: undefined, capacity: 80 }), 'capacity')).toBe('ok')
  })

  describe('landingLead', () => {
    const base = { ...complete(), description: '' }
    it('sin ningún texto es todo', () => {
      expect(stateOf(run(base), 'landingLead')).toBe('todo')
    })
    it('acepta landing.slots.heroLead, publicCopy.heroLead o la descripción', () => {
      expect(stateOf(run({ ...base, landing: { slots: { heroLead: 'Una oferta' } } }), 'landingLead')).toBe('ok')
      expect(stateOf(run({ ...base, publicCopy: { heroLead: 'Una oferta' } }), 'landingLead')).toBe('ok')
      expect(stateOf(run({ ...base, description: 'Una oferta' }), 'landingLead')).toBe('ok')
    })
  })

  describe('landingCta', () => {
    const noCta = { ...complete(), publicCopy: {} }
    it('con texto propio es ok, venga de publicCopy o de la landing', () => {
      expect(stateOf(run({ ...noCta, salesIntent: 'charge', publicCopy: { ctaLabel: 'Anotarme' } }), 'landingCta')).toBe('ok')
      expect(stateOf(run({ ...noCta, salesIntent: 'charge', landing: { slots: { ctaLabel: 'Sumate' } } }), 'landingCta')).toBe('ok')
    })
    it('sin texto: ok si el evento no cobra (solo anuncio y sin entradas), todo si cobra', () => {
      expect(stateOf(run({ ...noCta, salesIntent: 'announce' }), 'landingCta')).toBe('ok')
      expect(stateOf(run({ ...noCta, salesIntent: 'charge' }), 'landingCta')).toBe('todo')
      expect(
        stateOf(run({ ...noCta, salesIntent: 'announce', pricing: { ticketsEnabled: true } }), 'landingCta'),
      ).toBe('todo')
    })
  })

  describe('image', () => {
    const bare = { ...complete(), logoUrl: undefined }
    it('falta: todo, pero no frena el ready', () => {
      const result = run(bare)
      expect(stateOf(result, 'image')).toBe('todo')
      expect(result.ready).toBe(true)
    })
    it('acepta logo, imagen de hero o ruta de hero de la landing', () => {
      expect(stateOf(run({ ...bare, heroImageUrl: 'https://cdn.example/h.jpg' }), 'image')).toBe('ok')
      expect(stateOf(run({ ...bare, logoPath: 'logos/x.png' }), 'image')).toBe('ok')
      expect(
        stateOf(run({ ...bare, landing: { slots: { heroImagePath: '/images/hero.jpg' } } }), 'image'),
      ).toBe('ok')
    })
  })

  describe('offering', () => {
    it('por defecto: ok con detail default', () => {
      const item = run(complete()).items.find((i) => i.key === 'offering')
      expect(item).toMatchObject({ state: 'ok', detail: 'default' })
    })
    it('restringido: sigue ok pero con detail restricted', () => {
      const item = run({ ...complete(), offering: normalizeEventOffering({ categories: ['Raw'] }) }).items.find(
        (i) => i.key === 'offering',
      )
      expect(item).toMatchObject({ state: 'ok', detail: 'restricted' })
    })
  })

  describe('registrationWindow', () => {
    it('sin ventana o con inscripción no abierta: ok', () => {
      expect(stateOf(run({ ...complete(), registrationClosesAt: '' }), 'registrationWindow')).toBe('ok')
      expect(
        stateOf(run({ ...complete(), status: 'proximamente', registrationClosesAt: '2020-01-01T00:00' }), 'registrationWindow'),
      ).toBe('ok')
    })
    it('abierta con cierre pasado: todo', () => {
      expect(stateOf(run({ ...complete(), registrationClosesAt: '2026-05-01T00:00' }), 'registrationWindow')).toBe('todo')
    })
    it('abierta con cierre anterior a la apertura: todo', () => {
      expect(
        stateOf(run({ ...complete(), registrationOpensAt: '2026-08-01T00:00', registrationClosesAt: '2026-07-01T00:00' }), 'registrationWindow'),
      ).toBe('todo')
    })
    it('cupos_limitados también cuenta como abierta', () => {
      expect(
        stateOf(run({ ...complete(), status: 'cupos_limitados', registrationClosesAt: '2026-05-01T00:00' }), 'registrationWindow'),
      ).toBe('todo')
    })
  })

  describe('sales (deriva del semáforo de cobro)', () => {
    const platform = {
      paymentChannels: {
        membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
        registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
        ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: false, wise_transfer: false },
      },
    }

    it('verde: ok', () => {
      const item = run({ ...complete(), salesIntent: 'charge' }, { platform }).items.find((i) => i.key === 'sales')
      expect(item).toMatchObject({ state: 'ok', detail: 'green' })
    })

    it('amarillo: warning, y no bloquea', () => {
      const result = run(
        {
          ...complete(),
          salesIntent: 'charge',
          paymentChannelOverrides: { registration: { mercado_pago: false } },
        },
        { platform },
      )
      expect(result.items.find((i) => i.key === 'sales')).toMatchObject({ state: 'warning', detail: 'yellow' })
      expect(result.ready).toBe(true)
    })

    it('rojo: todo, y el evento no está listo', () => {
      const result = run(
        {
          ...complete(),
          pricing: { ticketsEnabled: true },
          ticketTypes: [],
          paymentChannelOverrides: { ticket: { mercado_pago: false, bank_transfer: false } },
        },
        { platform },
      )
      expect(result.items.find((i) => i.key === 'sales')).toMatchObject({ state: 'todo', detail: 'red' })
      expect(result.ready).toBe(false)
    })
  })

  it('ready ignora warning pero respeta cualquier todo', () => {
    expect(run({ ...complete(), title: '' }).ready).toBe(false)
    expect(run({ ...complete(), startsAt: '2026-05-01T09:00', endsAt: '2026-05-01T18:00', registrationClosesAt: '' }).ready).toBe(true)
  })

  it('doneCount cuenta solo ok (warning y todo no suman)', () => {
    const result = run({ ...complete(), venue: '', location: '', startsAt: '2026-05-01T09:00', endsAt: '2026-05-01T18:00', registrationClosesAt: '' })
    expect(result.doneCount).toBe(result.items.filter((i) => i.state === 'ok').length)
    expect(result.doneCount).toBe(8)
  })

  it('no muta la entrada', () => {
    const event = complete()
    event.landing = { slots: { heroLead: 'x' } }
    const snapshot = JSON.stringify(event)
    run(event, { platform: {}, mpProfiles: [] })
    expect(JSON.stringify(event)).toBe(snapshot)
  })

  describe('draft vs evento mapeado', () => {
    const row = {
      id: 'e1',
      slug: 'pitbull',
      title: 'Pitbull Classic',
      description: 'Meet nacional.',
      venue: 'Club',
      location: 'Rosario',
      starts_at: '2026-09-10T12:00:00.000Z',
      ends_at: '2026-09-10T23:00:00.000Z',
      registration_closes_at: '2026-09-01T00:00:00.000Z',
      capacity: 100,
      status: 'inscripcion_abierta',
      logo_url: 'https://cdn.example/logo.png',
      rules: { salesIntent: 'announce' },
    }
    it('dan el mismo resultado para el mismo evento', () => {
      const event = mapSupabaseEventRow(row)
      const draft = { ...buildAdminEventDraft(event), logoUrl: event.logoUrl }
      const fromEvent = run(event)
      const fromDraft = run(draft)
      expect(fromDraft.items.map((i) => [i.key, i.state])).toEqual(fromEvent.items.map((i) => [i.key, i.state]))
      expect(fromEvent.ready).toBe(true)
    })
    it('un evento mapeado sin datos de contenido marca lo que falta', () => {
      const event = mapSupabaseEventRow({ ...row, title: '', venue: '', location: '', description: '', logo_url: null })
      const result = run(event)
      expect(stateOf(result, 'title')).toBe('todo')
      expect(stateOf(result, 'venue')).toBe('todo')
      expect(stateOf(result, 'landingLead')).toBe('todo')
      expect(result.ready).toBe(false)
    })
  })
})
