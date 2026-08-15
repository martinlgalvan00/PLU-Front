import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/hooks/useEventRegistrationCapacity.js', () => ({
  useEventRegistrationCapacity: () => ({
    status: 'live',
    registered: 1,
    slots: 80,
    recent: [
      {
        displayName: 'Ana T.',
        gym: 'Fuerza Sur',
        photoUrl: 'https://example.test/ana.jpg',
        registeredAt: '2026-08-21T12:00:00Z',
      },
    ],
  }),
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
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = window.IntersectionObserver
})

afterEach(cleanup)

describe('últimos inscriptos de Pitbull', () => {
  it('jerarquiza foto, nombre y gimnasio en campos separados', () => {
    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[
            {
              slug: 'pitbull-classic-2026',
              title: 'Pitbull Classic',
              featured: true,
              status: 'inscripcion_abierta',
              price: 75000,
            },
          ]}
          onNavigate={vi.fn()}
          onSelectEvent={vi.fn()}
        />
      </I18nProvider>,
    )

    const recent = container.querySelector('.pitbull-recent')
    expect(recent?.querySelector('.pitbull-recent__name')?.textContent).toBe('Ana T.')
    expect(recent?.querySelector('.pitbull-recent__gym')?.textContent).toBe('Fuerza Sur')
    expect(recent?.querySelector('.pitbull-recent__portrait img')?.getAttribute('src')).toBe(
      'https://example.test/ana.jpg',
    )
  })
})
