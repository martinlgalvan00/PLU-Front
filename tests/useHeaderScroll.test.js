import { describe, expect, it } from 'vitest'
import {
  easeHeaderScrollProgress,
  quantizeHeaderScrollProgress,
  resolveHeaderScrolled,
} from '../src/hooks/useMotion.js'

describe('resolveHeaderScrolled', () => {
  const band = { enterAt: 96, exitAt: 52 }

  it('entra a scrolled solo al cruzar enterAt', () => {
    expect(resolveHeaderScrolled(95, { wasScrolled: false, ...band })).toBe(false)
    expect(resolveHeaderScrolled(96, { wasScrolled: false, ...band })).toBe(true)
  })

  it('mantiene scrolled dentro de la banda de histeresis', () => {
    expect(resolveHeaderScrolled(80, { wasScrolled: true, ...band })).toBe(true)
    expect(resolveHeaderScrolled(53, { wasScrolled: true, ...band })).toBe(true)
  })

  it('sale de scrolled solo por debajo de exitAt', () => {
    expect(resolveHeaderScrolled(52, { wasScrolled: true, ...band })).toBe(false)
    expect(resolveHeaderScrolled(40, { wasScrolled: true, ...band })).toBe(false)
  })
})

describe('easeHeaderScrollProgress', () => {
  it('clampéa fuera de rango y fija extremos', () => {
    expect(easeHeaderScrollProgress(-1)).toBe(0)
    expect(easeHeaderScrollProgress(0)).toBe(0)
    expect(easeHeaderScrollProgress(1)).toBe(1)
    expect(easeHeaderScrollProgress(2)).toBe(1)
  })

  it('suaviza el medio respecto a lineal (smoothstep)', () => {
    expect(easeHeaderScrollProgress(0.5)).toBe(0.5)
    expect(easeHeaderScrollProgress(0.25)).toBeLessThan(0.25)
    expect(easeHeaderScrollProgress(0.75)).toBeGreaterThan(0.75)
  })
})

describe('quantizeHeaderScrollProgress', () => {
  it('reduce resolución sin salir de 0–1', () => {
    expect(quantizeHeaderScrollProgress(0, 24)).toBe(0)
    expect(quantizeHeaderScrollProgress(1, 24)).toBe(1)
    expect(quantizeHeaderScrollProgress(0.51, 2)).toBe(0.5)
    expect(quantizeHeaderScrollProgress(0.76, 4)).toBe(0.75)
  })
})
