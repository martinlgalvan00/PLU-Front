import { describe, expect, it } from 'vitest'
import {
  filterGymOptions,
  findUniqueCoreMatch,
  getCoreName,
  isSimilarCore,
  isNewGymName,
  mergeGymVariants,
  preferGymName,
} from '../src/lib/gymNormalize.js'

describe('gymNormalize', () => {
  it('extrae el mismo core para variantes de Pitbull', () => {
    expect(getCoreName('Pitbull')).toBe('pitbull')
    expect(getCoreName('PITBULL')).toBe('pitbull')
    expect(getCoreName('PitBull')).toBe('pitbull')
    expect(getCoreName('Pitbull barbell club')).toBe('pitbull')
    expect(getCoreName('Pitbull Barbell Club')).toBe('pitbull')
  })

  it('considera similares los cores de Pitbull', () => {
    expect(isSimilarCore('pitbull', 'pitbull')).toBe(true)
    expect(isSimilarCore(getCoreName('Pitbull'), getCoreName('Pitbull Barbell Club'))).toBe(true)
  })

  it('preferGymName elige el nombre más completo', () => {
    expect(preferGymName('Pitbull', 'Pitbull Barbell Club')).toBe('Pitbull Barbell Club')
    expect(preferGymName('Pitbull Barbell Club', 'Pitbull')).toBe('Pitbull Barbell Club')
  })

  it('mergeGymVariants colapsa variantes a un solo ancla canónico largo', () => {
    const anchors = mergeGymVariants([
      { name: 'Pitbull', count: 40 },
      { name: 'PITBULL', count: 5 },
      { name: 'Pitbull barbell club', count: 3 },
      { name: 'Pitbull Barbell Club', count: 2 },
      { name: 'Maximal Power', count: 10 },
    ])

    const pitbull = anchors.find((a) => a.core === 'pitbull')
    expect(pitbull).toBeTruthy()
    expect(pitbull.name).toBe('Pitbull Barbell Club')
    expect(pitbull.count).toBe(50)

    const maximal = anchors.find((a) => a.core.includes('maximal'))
    expect(maximal?.name).toBe('Maximal Power')
    expect(anchors).toHaveLength(2)
  })

  it('filterGymOptions encuentra por substring normalizado', () => {
    const options = ['Pitbull Barbell Club', 'Maximal Power', 'Iron Temple']
    expect(filterGymOptions(options, 'pit')).toEqual(['Pitbull Barbell Club'])
    expect(filterGymOptions(options, 'power')).toEqual(['Maximal Power'])
    expect(filterGymOptions(options, '')).toEqual([])
  })

  it('findUniqueCoreMatch resuelve Pitbull al canónico', () => {
    const options = ['Pitbull Barbell Club', 'Maximal Power']
    expect(findUniqueCoreMatch(options, 'Pitbull')).toBe('Pitbull Barbell Club')
    expect(findUniqueCoreMatch(options, 'pitbull barbell')).toBe('Pitbull Barbell Club')
    expect(findUniqueCoreMatch(options, 'xyz')).toBeNull()
  })

  it('distingue un equipo existente de un nombre nuevo para la confirmacion', () => {
    const options = ['Pitbull Barbell Club', 'Maximal Power', 'A']

    expect(isNewGymName(options, ' pitbull ')).toBe(false)
    expect(isNewGymName(options, 'A')).toBe(false)
    expect(isNewGymName(options, 'Nuevo Equipo')).toBe(true)
    expect(isNewGymName(options, '   ')).toBe(false)
  })
})
