import { describe, expect, it } from 'vitest'
import {
  getFeaturedEvent,
  getFeaturedEventDestination,
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
})
