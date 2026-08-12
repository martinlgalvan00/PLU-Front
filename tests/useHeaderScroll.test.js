import { describe, expect, it } from 'vitest'
import { resolveHeaderScrolled } from '../src/hooks/useMotion.js'

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
