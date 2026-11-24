import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  landingPaletteStyle,
  normalizeLandingPalette,
  paletteContrastWarnings,
  readableTextOn,
} from '../src/lib/eventLandingPalette.js'

describe('paleta de la landing', () => {
  it('conserva solo hex válidos, en minúscula', () => {
    expect(
      normalizeLandingPalette({ accent: '#FF8800', action: 'red', background: '#12', extra: '#000000' }),
    ).toEqual({ accent: '#ff8800' })
  })

  it('sin colores propios no pisa el tema', () => {
    expect(landingPaletteStyle({})).toEqual({})
    expect(landingPaletteStyle({ palette: {} })).toEqual({})
  })

  it('deriva el texto del fondo para que siempre se lea', () => {
    expect(readableTextOn('#0d0f12')).toBe('#ffffff')
    expect(readableTextOn('#f4f1ea')).toBe('#14181f')
    const dark = landingPaletteStyle({ palette: { background: '#101820' } })
    const light = landingPaletteStyle({ palette: { background: '#fafafa' } })
    expect(dark['--color-text']).toBe('#ffffff')
    expect(light['--color-text']).toBe('#14181f')
    expect(contrastRatio(light['--color-bg'], light['--color-text'])).toBeGreaterThan(7)
  })

  it('el color del botón define el texto del botón', () => {
    const style = landingPaletteStyle({ palette: { action: '#f5c518' } })
    expect(style['--event-action']).toBe('#f5c518')
    expect(style['--event-action-text']).toBe('#14181f')
    expect(landingPaletteStyle({ palette: { action: '#0b2a6f' } })['--event-action-text']).toBe(
      '#ffffff',
    )
  })

  it('withBackground:false aplica solo acento y botón', () => {
    const style = landingPaletteStyle(
      { palette: { accent: '#ff8800', background: '#ffffff' } },
      { withBackground: false },
    )
    expect(style).toHaveProperty('--event-accent')
    expect(style).not.toHaveProperty('--color-bg')
  })

  it('avisa cuando el acento o el botón no se distinguen del fondo', () => {
    expect(paletteContrastWarnings({ accent: '#101820', background: '#0d0f12' })).toEqual([
      expect.objectContaining({ code: 'accentOnBackground' }),
    ])
    expect(paletteContrastWarnings({ accent: '#ffcc00', action: '#ffcc00', background: '#0d0f12' })).toEqual([])
    expect(paletteContrastWarnings({ action: '#fafafa', background: '#ffffff' })).toEqual([
      expect.objectContaining({ code: 'actionOnBackground' }),
    ])
  })
})
