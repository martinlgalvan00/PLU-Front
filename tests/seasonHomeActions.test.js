import { describe, expect, it } from 'vitest'
import { getSeasonHomeActions } from '../src/lib/eventNavigation.js'

const NOW = new Date('2026-10-15T12:00:00-03:00')

const PITBULL = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'cerrado',
  published: true,
  dateISO: '2026-12-12',
  pricing: { ticketsEnabled: true },
  eventDays: [{ dayIndex: 0, label: 'Día 1' }],
  ticketTypes: [{ id: 'general', name: 'General', price: 15000, active: true }],
}

const BARBELL_OPEN = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  status: 'inscripcion_abierta',
  published: true,
  dateISO: '2027-03-06',
  venue: 'Virtus fitness',
  pricing: { ticketsEnabled: false },
}

const BARBELL_SOON = {
  ...BARBELL_OPEN,
  status: 'proximamente',
}

describe('getSeasonHomeActions', () => {
  it('arma el dúo entradas Pitbull + inscripción abierta Barbell Submission', () => {
    const actions = getSeasonHomeActions([PITBULL, BARBELL_OPEN], {
      now: NOW,
      registrationEnabled: true,
      ticketSalesEnabled: true,
    })

    expect(actions.map((action) => [action.kind, action.event.slug])).toEqual([
      ['tickets', 'pitbull-classic-2026'],
      ['registration', 'barbell-submission-2027'],
    ])
  })

  it('con Virtus en próximamente muestra teaser, no inscripción abierta', () => {
    const actions = getSeasonHomeActions([PITBULL, BARBELL_SOON], {
      now: NOW,
      registrationEnabled: true,
      ticketSalesEnabled: true,
    })

    expect(actions.map((action) => [action.kind, action.event.slug])).toEqual([
      ['tickets', 'pitbull-classic-2026'],
      ['registration_soon', 'barbell-submission-2027'],
    ])
  })

  it('no promociona un meet cerrado o finalizado como inscripción', () => {
    const actions = getSeasonHomeActions(
      [
        PITBULL,
        { ...BARBELL_SOON, status: 'cerrado' },
        {
          slug: 'old-meet',
          title: 'Old',
          status: 'finalizado',
          published: true,
          dateISO: '2025-01-01',
        },
      ],
      { now: NOW, registrationEnabled: true, ticketSalesEnabled: true },
    )

    expect(actions).toEqual([{ kind: 'tickets', event: PITBULL }])
  })

  it('omite entradas si el interruptor de tickets está apagado', () => {
    const actions = getSeasonHomeActions([PITBULL, BARBELL_OPEN], {
      now: NOW,
      registrationEnabled: true,
      ticketSalesEnabled: false,
    })

    expect(actions).toEqual([{ kind: 'registration', event: BARBELL_OPEN }])
  })

  it('con cobros pausados sigue ofreciendo el teaser de Virtus', () => {
    const actions = getSeasonHomeActions([PITBULL, BARBELL_SOON], {
      now: NOW,
      registrationEnabled: false,
      ticketSalesEnabled: true,
    })

    expect(actions.map((action) => action.kind)).toEqual(['tickets', 'registration_soon'])
  })

  it('prioriza barbell-submission abierto sobre otro meet abierto', () => {
    const otherOpen = {
      slug: 'winter-open-2027',
      title: 'Winter Open',
      status: 'inscripcion_abierta',
      published: true,
      dateISO: '2027-01-10',
    }
    const actions = getSeasonHomeActions([PITBULL, otherOpen, BARBELL_OPEN], {
      now: NOW,
      registrationEnabled: true,
      ticketSalesEnabled: true,
    })

    expect(actions.find((action) => action.kind === 'registration')?.event.slug).toBe(
      'barbell-submission-2027',
    )
  })

  describe('landing en construcción', () => {
    const hidden = (overrides = {}) => ({
      ...BARBELL_OPEN,
      registrationOpensAt: null,
      salesIntent: 'charge',
      landing: { templateId: 'submission', publicVisible: false },
      ...overrides,
    })

    it('con la venta abierta ocupa el carril de inscripción aunque no esté en el catálogo', () => {
      const event = hidden()
      // El catálogo público la excluye: llega solo por `underConstructionEvents`.
      const actions = getSeasonHomeActions([PITBULL, event], {
        now: NOW,
        registrationEnabled: true,
        ticketSalesEnabled: true,
        underConstructionEvents: [event],
      })

      expect(actions.map((action) => [action.kind, action.event.slug])).toEqual([
        ['tickets', 'pitbull-classic-2026'],
        ['registration', 'barbell-submission-2027'],
      ])
    })

    it('programada sale como "próximamente"', () => {
      const event = hidden({ registrationOpensAt: '2026-11-20T12:00:00-03:00' })
      const actions = getSeasonHomeActions([PITBULL], {
        now: NOW,
        registrationEnabled: true,
        ticketSalesEnabled: true,
        underConstructionEvents: [event],
      })

      expect(actions.map((action) => action.kind)).toEqual(['tickets', 'registration_soon'])
    })

    it('con la venta cerrada o en "Solo anuncio" no aparece', () => {
      const options = { now: NOW, registrationEnabled: true, ticketSalesEnabled: true }
      for (const event of [hidden({ status: 'cerrado' }), hidden({ salesIntent: 'announce' })]) {
        expect(
          getSeasonHomeActions([PITBULL], { ...options, underConstructionEvents: [event] }),
        ).toEqual([{ kind: 'tickets', event: PITBULL }])
      }
    })

    it('con la inscripción pausada en la plataforma no aparece', () => {
      const actions = getSeasonHomeActions([PITBULL], {
        now: NOW,
        registrationEnabled: false,
        ticketSalesEnabled: true,
        underConstructionEvents: [hidden()],
      })

      expect(actions).toEqual([{ kind: 'tickets', event: PITBULL }])
    })

    it('despublicada no aparece', () => {
      const actions = getSeasonHomeActions([PITBULL], {
        now: NOW,
        registrationEnabled: true,
        ticketSalesEnabled: true,
        underConstructionEvents: [hidden({ published: false })],
      })

      expect(actions).toEqual([{ kind: 'tickets', event: PITBULL }])
    })
  })

  it('no ofrece entradas si el interruptor está prendido pero falta el precio', () => {
    const actions = getSeasonHomeActions(
      [{ ...PITBULL, ticketTypes: [{ id: 'general', price: 0, active: true }] }],
      { now: NOW, registrationEnabled: true, ticketSalesEnabled: true },
    )
    expect(actions).toEqual([])
  })

  it('devuelve vacío si no hay nada operable', () => {
    expect(
      getSeasonHomeActions(
        [{ ...PITBULL, pricing: { ticketsEnabled: false }, status: 'cerrado' }],
        { now: NOW, registrationEnabled: true, ticketSalesEnabled: true },
      ),
    ).toEqual([])
  })
})
