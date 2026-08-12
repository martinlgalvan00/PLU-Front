import { describe, expect, it } from 'vitest'
import { PUBLIC_NAVIGATION } from '../src/lib/constants.js'

const PUBLIC_VIEWS = new Set([
  'members',
  'pitbull',
  'events',
  'results',
  'records',
  'resources',
  'rulebook',
  'community',
  'faq',
  'contact',
  'shop',
  'tickets',
  'team',
  'sponsors',
  'standards',
])

describe('navegación pública', () => {
  it('mantiene una única definición para cada acceso principal', () => {
    const primaryKeys = PUBLIC_NAVIGATION.primary.map(({ key }) => key)

    expect(new Set(primaryKeys).size).toBe(primaryKeys.length)
    expect(primaryKeys).toEqual([
      'members',
      'competition',
      'results',
      'records',
      'more',
    ])
  })

  it('solo referencia vistas públicas reales', () => {
    const destinations = PUBLIC_NAVIGATION.primary.flatMap((item) => {
      if (item.items) return item.items.map(({ key }) => key)
      if (item.groups) return item.groups.flatMap((group) => group.items.map(({ key }) => key))
      return [item.key]
    })

    destinations.forEach((destination) => {
      expect(PUBLIC_VIEWS.has(destination)).toBe(true)
    })
  })

  it('expone IA federativa top-level y agrupa el resto en Más', () => {
    const competition = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'competition')
    const more = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'more')

    expect(competition.views).toEqual(['events', 'pitbull', 'shop', 'tickets'])
    expect(competition.views).toContain('pitbull')
    expect(competition.views).toContain('shop')

    expect(more.views).toEqual([
      'rulebook',
      'resources',
      'faq',
      'community',
      'contact',
      'team',
      'sponsors',
      'standards',
    ])
    expect(more.views).toContain('rulebook')
    expect(more.views).toContain('standards')
    expect(more.views).not.toContain('members')
    expect(more.views).not.toContain('events')
    expect(more.views).not.toContain('pitbull')
  })
})
