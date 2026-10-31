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

describe('Pitbull · inscripción cerrada', () => {
  it('alinea badge, CTA del hero y shell cuando el status es cerrado', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[
            {
              slug: 'pitbull-classic-2026',
              title: 'Pitbull Classic',
              featured: true,
              status: 'cerrado',
              price: 115000,
              pricing: { membership: 85000, registration: 115000 },
            },
          ]}
          onNavigate={onNavigate}
          onSelectEvent={vi.fn()}
        />
      </I18nProvider>,
    )

    const heroBadge = container.querySelector('.pitbull-hero-masthead__status-badge')
    expect(heroBadge?.textContent).toMatch(/Inscripción cerrada/i)
    expect(heroBadge?.className).toContain('status-badge--danger')

    const heroPrimary = container.querySelector('.pitbull-hero-masthead__cta--primary')
    expect(heroPrimary?.textContent).toMatch(/Inscripción cerrada/i)
    expect(heroPrimary?.disabled).toBe(true)
    expect(heroPrimary?.textContent).not.toMatch(/115\.000/)

    const heroSecondary = container.querySelector('.pitbull-hero-masthead__cta--secondary')
    expect(heroSecondary?.textContent).toMatch(/Afiliarme/i)
    fireEvent.click(heroSecondary)
    expect(onNavigate).toHaveBeenCalledWith('members')

    const shellLead = container.querySelector('.pitbull-inscription-deck__lead')
    expect(shellLead?.textContent).toMatch(/inscripción está cerrada/i)

    const shellPrimary = container.querySelector('.pitbull-inscription__cta--primary')
    expect(shellPrimary?.textContent).toMatch(/Inscripción cerrada/i)
    expect(shellPrimary?.disabled).toBe(true)
  })

  it('cierra la UI pública si pasó registrationClosesAt aunque el status siga abierto', () => {
    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[
            {
              slug: 'pitbull-classic-2026',
              title: 'Pitbull Classic',
              featured: true,
              status: 'inscripcion_abierta',
              registrationClosesAt: '2020-01-01T00:00:00.000Z',
              price: 115000,
              pricing: { membership: 85000, registration: 115000 },
            },
          ]}
          onNavigate={vi.fn()}
          onSelectEvent={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(container.querySelector('.pitbull-hero-masthead__status-badge')?.textContent).toMatch(
      /Inscripción cerrada/i,
    )
    expect(container.querySelector('.pitbull-hero-masthead__cta--primary')?.disabled).toBe(true)
    expect(container.querySelector('.pitbull-inscription-deck__lead')?.textContent).toMatch(
      /inscripción está cerrada/i,
    )
  })

  it('con la inscripción cerrada y entradas abiertas, el botón dorado compra la entrada', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <I18nProvider>
        <PitbullPage
          events={[
            {
              slug: 'pitbull-classic-2026',
              title: 'Pitbull Classic',
              featured: true,
              published: true,
              status: 'cerrado',
              price: 115000,
              eventDays: [{ id: 'd1', label: 'Día 1' }],
              ticketTypes: [{ id: 'general', name: 'Público General', price: 17000, active: true }],
              pricing: { membership: 85000, registration: 115000, ticketsEnabled: true },
            },
          ]}
          onNavigate={onNavigate}
          onSelectEvent={vi.fn()}
        />
      </I18nProvider>,
    )

    const heroBadge = container.querySelector('.pitbull-hero-masthead__status-badge')
    expect(heroBadge?.textContent).toMatch(/Inscripción cerrada/i)

    const heroPrimary = container.querySelector('.pitbull-hero-masthead__cta--primary')
    expect(heroPrimary?.textContent).toMatch(/Conseguir entrada/i)
    expect(heroPrimary?.disabled).toBe(false)
    fireEvent.click(heroPrimary)
    expect(onNavigate).toHaveBeenCalledWith('tickets', { eventSlug: 'pitbull-classic-2026' })

    const heroSecondary = container.querySelector('.pitbull-hero-masthead__cta--secondary')
    expect(heroSecondary?.textContent).toMatch(/Afiliarme/i)

    const shellPrimary = container.querySelector('.pitbull-inscription__cta--primary')
    expect(shellPrimary?.textContent).toMatch(/Conseguir entrada/i)
    expect(shellPrimary?.disabled).toBe(false)
  })
})
