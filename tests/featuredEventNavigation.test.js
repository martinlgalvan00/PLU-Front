import { describe, expect, it } from 'vitest'
import {
  getFeaturedEvent,
  getFeaturedEventDestination,
  getPitbullClassicEvent,
} from '../src/lib/eventNavigation.js'

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

  it('conserva la pagina editorial propia de Pitbull cuando es el destacado', () => {
    expect(getFeaturedEventDestination({ slug: 'pitbull-classic-2026' })).toEqual({
      view: 'pitbull',
      options: {},
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
