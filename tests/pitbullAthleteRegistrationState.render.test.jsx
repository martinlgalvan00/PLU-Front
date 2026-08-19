import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * La página del meet no recibía `registrations`, así que le ofrecía
 * "Inscribirme" a alguien que ya había pagado mientras su perfil lo mostraba
 * inscripto. Estos casos fijan que la página del torneo diga lo mismo que la
 * cuenta.
 */

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

const PITBULL = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  featured: true,
  status: 'inscripcion_abierta',
  price: 75000,
  pricing: { membership: 75000, registration: 75000, combo: 120000 },
}

const SESSION = { role: 'athlete_plu', athleteId: 'ath-1' }

function renderPitbull({ registrations = [], onNavigate = vi.fn(), onSelectEvent = vi.fn() } = {}) {
  const view = render(
    <I18nProvider>
      <PitbullPage
        events={[PITBULL]}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
        registrations={registrations}
        session={SESSION}
      />
    </I18nProvider>,
  )
  return { ...view, onNavigate, onSelectEvent }
}

describe('página del torneo · estado del atleta', () => {
  it('avisa que ya está inscripto y lleva a su inscripción en vez de al checkout', () => {
    const { container, onNavigate, onSelectEvent } = renderPitbull({
      registrations: [
        {
          athleteId: 'ath-1',
          eventSlug: 'pitbull-classic-2026',
          event: 'Pitbull Classic',
          status: 'confirmada',
        },
      ],
    })

    const state = container.querySelector('.pitbull-inscription-mine')
    expect(state).not.toBeNull()
    expect(state.getAttribute('data-state')).toBe('registered')
    expect(state.textContent).toContain('Ya estás inscripto')

    fireEvent.click(container.querySelector('.pitbull-inscription__cta--primary'))
    expect(onNavigate).toHaveBeenCalledWith('profile')
    expect(onSelectEvent).not.toHaveBeenCalled()
  })

  it('con el pago a medias ofrece cerrarlo y abre el checkout del meet', () => {
    const { container, onSelectEvent } = renderPitbull({
      registrations: [
        { athleteId: 'ath-1', eventSlug: 'pitbull-classic-2026', status: 'pendiente_pago' },
      ],
    })

    const state = container.querySelector('.pitbull-inscription-mine')
    expect(state.getAttribute('data-state')).toBe('pending_payment')

    fireEvent.click(container.querySelector('.pitbull-inscription__cta--primary'))
    expect(onSelectEvent).toHaveBeenCalledWith(PITBULL)
  })

  it('no reclama nada a quien canceló: vuelve a ofrecer la inscripción', () => {
    const { container, onSelectEvent } = renderPitbull({
      registrations: [
        { athleteId: 'ath-1', eventSlug: 'pitbull-classic-2026', status: 'cancelada' },
      ],
    })

    expect(container.querySelector('.pitbull-inscription-mine')).toBeNull()

    fireEvent.click(container.querySelector('.pitbull-inscription__cta--primary'))
    expect(onSelectEvent).toHaveBeenCalledWith(PITBULL)
  })

  it('no filtra la inscripción de otro atleta', () => {
    const { container } = renderPitbull({
      registrations: [
        { athleteId: 'ath-2', eventSlug: 'pitbull-classic-2026', status: 'confirmada' },
      ],
    })

    expect(container.querySelector('.pitbull-inscription-mine')).toBeNull()
  })
})
