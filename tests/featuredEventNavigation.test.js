import { describe, expect, it } from 'vitest'
import {
  getCompetitionNavEventKey,
  getCompetitionNavEvents,
  getFeaturedEvent,
  getFeaturedEventDestination,
  getPitbullClassicEvent,
} from '../src/lib/eventNavigation.js'

const NOW = new Date('2026-06-01T12:00:00')

function meet(partial) {
  return {
    published: true,
    featured: false,
    status: 'publicado',
    ...partial,
  }
}

describe('navegacion del evento destacado', () => {
  it('abre por slug cualquier evento destacado que no sea Pitbull', () => {
    const featured = getFeaturedEvent([
      { slug: 'pitbull-classic-2026', featured: false, dateISO: '2026-12-12' },
      { slug: 'test-2026', featured: true, dateISO: '2026-12-20' },
    ])

    expect(featured.slug).toBe('test-2026')
    expect(getFeaturedEventDestination(featured)).toEqual({
      view: 'events',
      options: { eventSlug: 'test-2026' },
    })
  })

  it('abre Pitbull por slug (la plantilla editorial la elige el renderer)', () => {
    expect(getFeaturedEventDestination({ slug: 'pitbull-classic-2026' })).toEqual({
      view: 'events',
      options: { eventSlug: 'pitbull-classic-2026' },
    })
  })

  it('no manda a pitbull solo por featured: true (navbar/shop)', () => {
    const springClassic = {
      slug: 'spring-classic-2025',
      featured: true,
      dateISO: '2025-05-18',
      title: 'Spring Classic 2025',
    }

    expect(getFeaturedEventDestination(springClassic)).toEqual({
      view: 'events',
      options: { eventSlug: 'spring-classic-2025' },
    })
  })

  it('abre la ficha generica de un evento no destacado por slug', () => {
    expect(
      getFeaturedEventDestination({
        slug: 'nacional-2026',
        featured: false,
        dateISO: '2026-08-13',
      }),
    ).toEqual({
      view: 'events',
      options: { eventSlug: 'nacional-2026' },
    })
  })

  it('elige el destacado explicito antes que el proximo por fecha', () => {
    const featured = getFeaturedEvent([
      { slug: 'soon-2026', featured: false, dateISO: '2026-08-13' },
      { slug: 'later-featured', featured: true, dateISO: '2026-12-20' },
    ])

    expect(featured.slug).toBe('later-featured')
  })

  it('la pagina Pitbull conserva su evento aunque otro destacado cueste $2', () => {
    const pitbull = {
      slug: 'pitbull-classic-2026',
      featured: false,
      price: 75000,
      pricing: { registration: 75000, membership: 75000, combo: 120000 },
    }
    const testEvent = {
      slug: 'test-2026',
      featured: true,
      price: 2,
      pricing: { registration: 2, membership: 1, combo: 3 },
    }

    expect(getFeaturedEvent([pitbull, testEvent])).toBe(testEvent)
    expect(getPitbullClassicEvent([pitbull, testEvent])).toBe(pitbull)
  })
})

describe('eventos de Competencia en la barra', () => {
  it('lista destacado y Pitbull cuando ambos estan vigentes', () => {
    const pitbull = meet({
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      dateISO: '2026-08-15',
    })
    const nacional = meet({
      slug: 'nacional-2026',
      title: 'Nacional 2026',
      featured: true,
      dateISO: '2026-12-20',
    })

    const navEvents = getCompetitionNavEvents([pitbull, nacional], NOW)

    expect(navEvents.map((event) => event.slug)).toEqual([
      'nacional-2026',
      'pitbull-classic-2026',
    ])
    expect(getCompetitionNavEventKey(navEvents[0])).toBe('event:nacional-2026')
  })

  it('si el destacado es Pitbull, el segundo slot es el proximo', () => {
    const pitbull = meet({
      slug: 'pitbull-classic-2026',
      featured: true,
      dateISO: '2026-08-15',
    })
    const nacional = meet({
      slug: 'nacional-2026',
      dateISO: '2026-12-20',
    })
    const primavera = meet({
      slug: 'primavera-2026',
      dateISO: '2026-09-01',
    })

    expect(getCompetitionNavEvents([pitbull, nacional, primavera], NOW).map((event) => event.slug)).toEqual([
      'pitbull-classic-2026',
      'primavera-2026',
    ])
  })

  it('con un solo meet publicado deja un solo item', () => {
    const pitbull = meet({
      slug: 'pitbull-classic-2026',
      dateISO: '2026-08-15',
    })

    expect(getCompetitionNavEvents([pitbull], NOW).map((event) => event.slug)).toEqual([
      'pitbull-classic-2026',
    ])
  })

  it('si el destacado ya no esta vigente, el primer slot es el proximo', () => {
    const expiredFeatured = meet({
      slug: 'otono-2026',
      featured: true,
      dateISO: '2026-04-01',
    })
    const pitbull = meet({
      slug: 'pitbull-classic-2026',
      dateISO: '2026-08-15',
    })
    const nacional = meet({
      slug: 'nacional-2026',
      dateISO: '2026-12-20',
    })

    expect(
      getCompetitionNavEvents([expiredFeatured, pitbull, nacional], NOW).map((event) => event.slug),
    ).toEqual(['pitbull-classic-2026', 'nacional-2026'])
  })

  it('filtra stubs y eventos ocultos', () => {
    const stub = meet({
      slug: 'test-2026',
      title: 'test',
      featured: true,
      dateISO: '2026-07-01',
    })
    const hidden = meet({
      slug: 'oculto-2026',
      published: false,
      dateISO: '2026-07-10',
    })
    const pitbull = meet({
      slug: 'pitbull-classic-2026',
      dateISO: '2026-08-15',
    })

    expect(getCompetitionNavEvents([stub, hidden, pitbull], NOW).map((event) => event.slug)).toEqual([
      'pitbull-classic-2026',
    ])
  })
})
