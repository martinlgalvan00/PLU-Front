import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const capacityMock = vi.fn()

vi.mock('../src/hooks/useEventRegistrationCapacity.js', () => ({
  useEventRegistrationCapacity: (...args) => capacityMock(...args),
}))

vi.mock('../src/components/ui/EventVenueMap.jsx', () => ({
  default: () => <div data-testid="venue-map" />,
}))

const PitbullPage = (await import('../src/pages/PitbullPage.jsx')).default

beforeAll(() => {
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  })
  window.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback
    }
    observe(element) {
      this.callback([{ isIntersecting: true, target: element }])
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = window.IntersectionObserver
})

afterEach(() => {
  cleanup()
  capacityMock.mockReset()
})

function renderPitbull(capacity = {}) {
  capacityMock.mockReturnValue({
    status: 'live',
    registered: 76,
    registeredToday: 3,
    slots: 180,
    progressPublic: true,
    recent: [
      {
        displayName: 'Ana Torres',
        gym: 'Fuerza Sur',
        photoUrl: 'https://example.test/ana.jpg',
        registeredAt: new Date().toISOString(),
      },
    ],
    ...capacity,
  })

  return render(
    <I18nProvider>
      <PitbullPage
        events={[
          {
            slug: 'pitbull-classic-2026',
            title: 'Pitbull Classic',
            featured: true,
            status: 'inscripcion_abierta',
            price: 85000,
            slots: 180,
          },
        ]}
        onNavigate={vi.fn()}
        onSelectEvent={vi.fn()}
      />
    </I18nProvider>,
  )
}

describe('últimos inscriptos de Pitbull', () => {
  it('jerarquiza foto, nombre y gimnasio en campos separados', () => {
    const { container } = renderPitbull()

    const recent = container.querySelector('.pitbull-recent')
    expect(recent?.querySelector('.pitbull-recent__name')?.textContent).toBe('Ana Torres')
    expect(recent?.querySelector('.pitbull-recent__name')?.getAttribute('title')).toBe('Ana Torres')
    expect(recent?.querySelector('.pitbull-recent__gym')?.textContent).toBe('Fuerza Sur')
    expect(recent?.querySelector('.pitbull-recent__portrait img')?.getAttribute('src')).toBe(
      'https://example.test/ana.jpg',
    )
  })

  it('en el contador muestra el avance y los lugares que quedan', () => {
    const { container } = renderPitbull()
    const counter = container.querySelector('.pitbull-inscription-counter')
    expect(counter?.textContent).toMatch(/\/\s*180/)
    expect(counter?.textContent).toMatch(/quedan 104 lugares/i)
  })

  it('puede ocultar el total y seguir mostrando anotados y lugares que quedan', () => {
    const { container } = renderPitbull({ totalPublic: false })
    const counter = container.querySelector('.pitbull-inscription-counter')
    expect(counter?.className).not.toContain('pitbull-inscription-counter--hidden')
    expect(counter?.querySelector('.pitbull-inscription-counter__of')).toBeNull()
    expect(counter?.textContent ?? '').not.toMatch(/\/\s*180/)
    expect(counter?.textContent ?? '').not.toMatch(/\b180\b/)
    expect(counter?.textContent ?? '').toMatch(/quedan 104 lugares/i)
    expect(counter?.querySelector('.pitbull-inscription-counter__value')).not.toBeNull()
  })

  it('sin total y el cupo justo sigue diciendo cuántos quedan, sin el máximo', () => {
    const { container } = renderPitbull({
      totalPublic: false,
      registered: 155,
      slots: 180,
    })
    const counter = container.querySelector('.pitbull-inscription-counter')
    expect(counter?.querySelector('.pitbull-inscription-counter__of')).toBeNull()
    expect(counter?.textContent ?? '').toMatch(/quedan 25 lugares/i)
    expect(counter?.textContent ?? '').not.toMatch(/\/\s*180/)
    expect(counter?.textContent ?? '').not.toMatch(/\b180\b/)
  })

  it('sigue mostrando recientes cuando el progreso de cupos está oculto', () => {
    const { container } = renderPitbull({
      progressPublic: false,
      registeredToday: 2,
    })

    const counter = container.querySelector('.pitbull-inscription-counter')
    expect(container.querySelector('.pitbull-recent')).toBeTruthy()
    expect(counter?.className).toContain('pitbull-inscription-counter--hidden')
    expect(counter?.textContent ?? '').not.toContain('—')
    expect(counter?.textContent ?? '').not.toMatch(/\b76\b/)
    expect(counter?.textContent ?? '').not.toMatch(/\b180\b/)
    expect(counter?.textContent ?? '').not.toMatch(/\b104\b/)
    expect(counter?.querySelector('.pitbull-inscription-counter__mark')?.textContent).toMatch(
      /Campo limitado/i,
    )
    expect(counter?.textContent).toMatch(/El avance no se muestra en público/i)
    expect(screen.getByText(/2 hoy · en vivo/i)).toBeTruthy()
    expect(container.querySelector('.pitbull-recent__today-mark')).toBeNull()
    expect(container.querySelector('.pitbull-recent__hint--live')).toBeTruthy()
  })

  it('no monta recientes en soft-launch', () => {
    capacityMock.mockReturnValue({
      status: 'live',
      registered: 0,
      registeredToday: 0,
      slots: 180,
      progressPublic: true,
      recent: [],
    })

    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[
            {
              slug: 'pitbull-classic-2026',
              title: 'Pitbull Classic',
              featured: true,
              status: 'proximamente',
              price: 85000,
              slots: 180,
            },
          ]}
          onNavigate={vi.fn()}
          onSelectEvent={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(container.querySelector('.pitbull-recent')).toBeNull()
    expect(container.querySelector('.pitbull-inscription-counter--soon')).toBeTruthy()
  })

  it('muestra la banda de entradas con hype cuando la venta todavía no abrió', () => {
    const { container } = renderPitbull()

    const band = container.querySelector('#entradas')
    expect(band?.className).toContain('pitbull-tickets-band--soon')
    expect(band?.textContent).toMatch(/El público también entra/i)
    expect(band?.querySelector('.pitbull-tickets-band__soon')?.textContent).toMatch(/Próximamente/i)
    expect(band?.querySelector('.pitbull-tickets-band__cta')).toBeNull()
  })
})
