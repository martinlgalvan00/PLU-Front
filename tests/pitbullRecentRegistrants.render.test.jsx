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
        displayName: 'Ana T.',
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
    expect(recent?.querySelector('.pitbull-recent__name')?.textContent).toBe('Ana T.')
    expect(recent?.querySelector('.pitbull-recent__gym')?.textContent).toBe('Fuerza Sur')
    expect(recent?.querySelector('.pitbull-recent__portrait img')?.getAttribute('src')).toBe(
      'https://example.test/ana.jpg',
    )
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
    expect(counter?.textContent).toMatch(/El progreso de inscripción no se publica/i)
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
})
