import { describe, expect, it } from 'vitest'
import {
  BAR_KG,
  clampPlates,
  initialPlates,
  loadedKg,
  MAX_PLATES,
  platesFor,
  PLATE_STACK,
  STATIC_PLATES,
} from '../src/lib/eventConstruction.js'

describe('escena de "en construcción"', () => {
  it('la barra sola pesa 20 kg y cada disco suma por los dos lados', () => {
    expect(loadedKg(0)).toBe(BAR_KG)
    expect(loadedKg(1)).toBe(20 + 2 * 20)
    expect(loadedKg(MAX_PLATES)).toBe(20 + 2 * PLATE_STACK.reduce((a, b) => a + b, 0))
  })

  it('acota la cantidad de discos y tolera valores raros', () => {
    expect(clampPlates(-4)).toBe(0)
    expect(clampPlates(99)).toBe(MAX_PLATES)
    expect(clampPlates(2.9)).toBe(2)
    expect(clampPlates('x')).toBe(0)
    expect(platesFor(3)).toEqual(PLATE_STACK.slice(0, 3))
  })

  it('sin animación arranca ya cargada a medias y con animación vacía', () => {
    expect(initialPlates({ animated: false })).toBe(STATIC_PLATES)
    expect(initialPlates({ animated: true })).toBe(0)
  })
})
