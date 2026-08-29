import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { ThemeProvider } from '../src/providers/ThemeProvider.jsx'
import EventVenueMap from '../src/components/ui/EventVenueMap.jsx'

vi.mock('../src/components/ui/OpenMapCanvas.jsx', () => ({
  default: function MockOpenMapCanvas({ onStatusChange }) {
    // Simula falla fatal de MapLibre / OpenFreeMap.
    queueMicrotask(() => onStatusChange?.('error'))
    return <div data-testid="open-map-canvas" />
  },
}))

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  window.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback
    }
    observe(node) {
      this.callback([{ isIntersecting: true, target: node }])
    }
    unobserve() {}
    disconnect() {}
  }
  // WebGL disponible: el componente intenta MapLibre y cae al embed.
  HTMLCanvasElement.prototype.getContext = () => ({})
})

afterEach(cleanup)

describe('EventVenueMap', () => {
  it('cae a embed OSM cuando MapLibre reporta error', async () => {
    const { container } = render(
      <ThemeProvider>
        <I18nProvider>
          <EventVenueMap
            event={{
              slug: 'pitbull-classic-2026',
              title: 'Pitbull Classic',
              status: 'inscripcion_abierta',
            }}
            role="Sede oficial"
            venue={{
              name: 'La Troupe Multiespacio',
              locality: 'Banfield',
              address: 'Gallo 148, B1832 Banfield',
              latitude: -34.7425,
              longitude: -58.3928,
              mapsUrl: 'https://maps.example/venue',
            }}
          />
        </I18nProvider>
      </ThemeProvider>,
    )

    const section = await screen.findByRole('region', {
      name: /mapa interactivo/i,
    })
    // Esperar a que el estado pase a embed tras el error del canvas mock.
    await vi.waitFor(() => {
      expect(container.querySelector('[data-venue-embed="true"]')).toBeTruthy()
    })

    const iframe = container.querySelector('iframe.competition-map__embed')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('src')).toContain('openstreetmap.org/export/embed.html')
    expect(iframe?.getAttribute('src')).toContain('marker=')
    expect(section).toBeTruthy()
  })
})
