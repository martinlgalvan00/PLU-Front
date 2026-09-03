import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENT_PUBLIC_SURFACE,
  eventHasCustomPublicPage,
  eventShowsPublicCalendar,
  eventShowsPublicCategories,
  eventShowsPublicExperience,
  eventShowsPublicWeighIns,
  normalizeEventPublicSurface,
  publicSurfaceModulesForEvent,
} from '../src/lib/eventPublicSurface.js'

describe('eventPublicSurface', () => {
  it('enciende todos los bloques si el dato falta', () => {
    expect(normalizeEventPublicSurface(undefined)).toEqual(DEFAULT_EVENT_PUBLIC_SURFACE)
  })

  it('respeta un apagado explícito y completa el resto', () => {
    expect(normalizeEventPublicSurface({ calendar: false })).toEqual({
      ...DEFAULT_EVENT_PUBLIC_SURFACE,
      calendar: false,
    })
  })

  it('lee los flags desde el evento mapeado', () => {
    const event = { publicSurface: { calendar: false, weighIns: false, categories: true } }
    expect(eventShowsPublicCalendar(event)).toBe(false)
    expect(eventShowsPublicWeighIns(event)).toBe(false)
    expect(eventShowsPublicCategories(event)).toBe(true)
    expect(eventShowsPublicExperience(event)).toBe(true)
  })

  it('en una landing custom expone experiencia, categorías y lugar', () => {
    const event = { slug: 'pitbull-classic-2026' }
    expect(eventHasCustomPublicPage(event)).toBe(true)
    expect(publicSurfaceModulesForEvent(event).map((module) => module.key)).toEqual([
      'calendar',
      'weighIns',
      'livestream',
      'experience',
      'categories',
      'location',
    ])
  })

  it('en un evento genérico no ofrece bloques de landing propia', () => {
    expect(publicSurfaceModulesForEvent({ slug: 'winter-open-2026' }).map((module) => module.key)).toEqual([
      'calendar',
      'weighIns',
      'livestream',
    ])
  })
})
