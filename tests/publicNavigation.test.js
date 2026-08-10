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
])

describe('navegación pública', () => {
  it('mantiene una única definición para cada acceso principal', () => {
    const primaryKeys = PUBLIC_NAVIGATION.primary.map(({ key }) => key)

    expect(new Set(primaryKeys).size).toBe(primaryKeys.length)
    expect(primaryKeys).toEqual([
      'members',
      'events',
      'competitions',
      'shop',
      'resources',
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

  it('separa calendario, competencias y recursos en estados activos coherentes', () => {
    const competitions = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'competitions')
    const resources = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'resources')

    expect(competitions.views).toEqual(['pitbull', 'tickets', 'results', 'records'])
    expect(resources.views).toEqual(['resources', 'rulebook', 'faq', 'community', 'contact'])
    expect(competitions.views).not.toContain('events')
    expect(resources.views).not.toContain('members')
  })
})
