import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/hooks/useEventRegistrationCapacity.js', () => ({
  useEventRegistrationCapacity: () => ({
    status: 'ready',
    registered: 10,
    slots: 80,
    recent: [],
  }),
}))

vi.mock('../src/components/ui/EventVenueMap.jsx', () => ({
  default: () => <div data-testid="venue-map" />,
}))

const PitbullPage = (await import('../src/pages/PitbullPage.jsx')).default

beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  window.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = window.IntersectionObserver
})

afterEach(cleanup)

describe('precio publico de Pitbull Classic', () => {
  it('usa Pitbull por slug aunque otro evento destacado tenga precio $2', () => {
    const pitbull = {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      featured: false,
      status: 'inscripcion_abierta',
      price: 75000,
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      comboOffer: {
        active: true,
        price: 120000,
        currency: 'ARS',
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2099-12-31T23:59:59.000Z',
      },
    }
    const featuredTestEvent = {
      slug: 'test-2026',
      title: 'test',
      featured: true,
      status: 'inscripcion_abierta',
      price: 2,
      pricing: { membership: 1, registration: 2, combo: 3 },
    }
    const onSelectEvent = vi.fn()

    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[featuredTestEvent, pitbull]}
          onNavigate={vi.fn()}
          onSelectEvent={onSelectEvent}
        />
      </I18nProvider>,
    )

    const comboText = container.querySelector('.season-combo-offer')?.textContent ?? ''
    expect(comboText).toContain('$\u00a075.000')
    expect(comboText).toContain('$\u00a0120.000')
    expect(comboText).toMatch(/20%/)
    expect(comboText).not.toMatch(/\$\s*[123](?:\D|$)/)

    fireEvent.click(container.querySelector('.pitbull-inscription__cta--primary'))
    expect(onSelectEvent).toHaveBeenCalledWith(pitbull)
  })

  it('si el atleta ya esta afiliado oculta el combo y ofrece solo el meet', () => {
    const pitbull = {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      featured: true,
      status: 'inscripcion_abierta',
      price: 75000,
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      comboOffer: {
        active: true,
        price: 120000,
        currency: 'ARS',
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2099-12-31T23:59:59.000Z',
      },
    }
    const onNavigate = vi.fn()
    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[pitbull]}
          memberships={[{
            athleteId: 'ath-1',
            status: 'activa',
            startDate: '2026-01-01',
            expirationDate: '2027-12-31',
          }]}
          onNavigate={onNavigate}
          onSelectEvent={vi.fn()}
          session={{ role: 'athlete_plu', athleteId: 'ath-1' }}
        />
      </I18nProvider>,
    )

    const prices = [...container.querySelectorAll('.pitbull-inscription-shell__price dd')]
      .map((node) => node.textContent)
      .join(' | ')
    expect(prices).toContain('$\u00a075.000')
    expect(prices).not.toContain('$\u00a0120.000')
    expect(container.querySelector('.pitbull-inscription-shell--combo')).toBeNull()
    expect(container.querySelector('.pitbull-inscription-shell--affiliated')).not.toBeNull()
    expect(container.querySelector('.pitbull-inscription__cta--primary')?.textContent)
      .toMatch(/Inscribirme/)
    fireEvent.click(container.querySelector('.pitbull-inscription__cta--secondary'))
    expect(onNavigate).toHaveBeenCalledWith('profile')
  })
})
