import { describe, expect, it } from 'vitest'
import { buildPlaceLinks } from '../src/lib/eventMap.js'

describe('buildPlaceLinks', () => {
  it('con dirección busca la dirección y la ciudad, no el nombre', () => {
    const links = buildPlaceLinks({
      name: 'Virtus Fitness',
      address: 'Calle 14 4567',
      city: 'Berazategui',
    })
    expect(links.query).toBe('Calle 14 4567, Berazategui')
    expect(links.googleMaps).toContain('query=Calle%2014%204567%2C%20Berazategui')
    expect(links.waze).toContain('q=Calle%2014%204567%2C%20Berazategui&navigate=yes')
  })

  it('sin dirección busca por nombre y ciudad', () => {
    expect(buildPlaceLinks({ name: 'La Troupé', city: 'Banfield' }).query).toBe(
      'La Troupé, Banfield',
    )
  })

  it('sin nada no inventa un destino', () => {
    expect(buildPlaceLinks({})).toBeNull()
  })
})
