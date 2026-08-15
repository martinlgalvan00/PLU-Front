import { describe, expect, it } from 'vitest'
import {
  getPublicCatalogEvents,
  isPublicCatalogStubEvent,
} from '../src/lib/eventNavigation.js'

describe('catalogo publico — exclusion de stubs', () => {
  it('detecta stubs triviales sin tocar meets reales', () => {
    expect(isPublicCatalogStubEvent({ title: 'test', slug: 'test' })).toBe(true)
    expect(isPublicCatalogStubEvent({ title: 'test test', slug: 'test-2026' })).toBe(true)
    expect(isPublicCatalogStubEvent({ title: 'prueba', slug: 'prueba' })).toBe(true)
    expect(
      isPublicCatalogStubEvent({
        title: 'Pitbull Classic',
        slug: 'pitbull-classic-2026',
      }),
    ).toBe(false)
    expect(
      isPublicCatalogStubEvent({
        title: 'National Test Meet',
        slug: 'national-test-meet-2026',
      }),
    ).toBe(false)
    expect(
      isPublicCatalogStubEvent({
        title: 'PIT ELITE',
        slug: 'test-2026',
      }),
    ).toBe(true)
  })

  it('saca stubs del catalogo y deja el resto', () => {
    const stub = { slug: 'test-2026', title: 'test', status: 'inscripcion_abierta' }
    const pitbull = {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      status: 'inscripcion_abierta',
    }

    expect(getPublicCatalogEvents([stub, pitbull]).map((event) => event.slug)).toEqual([
      'pitbull-classic-2026',
    ])
  })

  it('no expone eventos que el staff acaba de ocultar, aunque lleguen mezclados al cliente', () => {
    const hidden = {
      slug: 'regional-2026',
      title: 'Regional Buenos Aires',
      status: 'inscripcion_abierta',
      published: false,
    }
    const live = {
      slug: 'nacional-2026',
      title: 'Nacional de Powerlifting',
      status: 'inscripcion_abierta',
      published: true,
    }

    expect(getPublicCatalogEvents([hidden, live]).map((event) => event.slug)).toEqual([
      'nacional-2026',
    ])
  })

  it('no lista stubs aunque el caller pida includeDevelopmentStubs', () => {
    const stub = { slug: 'test-2026', title: 'PIT ELITE', status: 'inscripcion_abierta' }
    const pitbull = {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      status: 'inscripcion_abierta',
    }

    expect(
      getPublicCatalogEvents([stub, pitbull], { includeDevelopmentStubs: true }).map(
        (event) => event.slug,
      ),
    ).toEqual(['pitbull-classic-2026'])
  })
})
