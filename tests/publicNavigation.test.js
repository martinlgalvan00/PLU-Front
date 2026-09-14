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
    // La tienda subió al primer nivel: era el único acceso de compra de la
    // barra y vivía adentro del desplegable de Competencia.
    expect(primaryKeys).toEqual(['members', 'competition', 'shop', 'results', 'records', 'more'])
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

    expect(competition.views).toEqual(['events', 'pitbull'])
    expect(competition.views).toContain('pitbull')

    // La tienda es un acceso propio y queda marcada en las dos vistas del
    // recorrido de compra: el catálogo y el checkout del evento.
    const shop = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'shop')
    expect(shop.type).toBeUndefined()
    expect(shop.views).toEqual(['shop', 'tickets'])
    // Y no queda duplicada adentro del desplegable.
    expect(competition.groups.flatMap((group) => group.items.map(({ key }) => key))).not.toContain(
      'shop',
    )

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
