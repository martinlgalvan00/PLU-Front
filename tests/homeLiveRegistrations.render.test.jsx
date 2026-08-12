import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * La landing tiene que mostrar la inscripción real del torneo: el número que
 * pinta la portada sale del summary del servidor, no del contenido estático.
 * Antes HomePage pedía ese summary y lo descartaba (PitbullSpotlight en
 * variante `home` nunca usaba `registered`/`slots`/`recent`).
 */

const fetchSummary = vi.fn()

vi.mock('../src/services/eventRegistrationApi.js', () => ({
  fetchEventRegistrationSummary: (slug) => fetchSummary(slug),
}))

const HomePage = (await import('../src/pages/HomePage.jsx')).default

/**
 * Un slug distinto por caso: la cache de `eventLiveStore` es de módulo y vive
 * lo que dura el proceso de test (es justamente lo que hace que Home y Pitbull
 * compartan un request). Reusar el mismo slug haría que el segundo caso leyera
 * el dato del primero en vez de pedirlo.
 */
function eventFor(slug, title = 'Pitbull Classic') {
  return {
    slug,
    title,
    featured: true,
    status: 'inscripcion_abierta',
    venue: 'Sede a confirmar',
    location: 'Buenos Aires',
    startsAt: '2026-12-12T09:00:00-03:00',
    registrationOpensAt: '2026-08-01T10:00:00-03:00',
  }
}

function renderHome(event) {
  return render(
    <I18nProvider>
      <HomePage events={[event]} onNavigate={() => {}} onSelectEvent={() => {}} />
    </I18nProvider>,
  )
}

beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  vi.resetModules()
  fetchSummary.mockReset()
})

afterEach(cleanup)

describe('inscriptos reales en la landing', () => {
  it('muestra la ocupación y los últimos inscriptos cuando el servidor los informa', async () => {
    fetchSummary.mockResolvedValue({
      capacity: 80,
      registered: 23,
      remaining: 57,
      recent: [
        { displayName: 'Camila R.', gym: 'Iron House', registeredAt: '2026-08-12T12:00:00-03:00' },
        { displayName: 'Nicolás F.', gym: '', registeredAt: '2026-08-12T11:00:00-03:00' },
        { displayName: 'Sofía L.', gym: '', registeredAt: '2026-08-12T10:00:00-03:00' },
        { displayName: 'Bruno M.', gym: '', registeredAt: '2026-08-11T10:00:00-03:00' },
      ],
    })

    renderHome(eventFor('pitbull-classic-2026'))

    const block = await waitFor(() => {
      const node = document.querySelector('.pitbull-spotlight__home-live')
      expect(node).toBeTruthy()
      return node
    })

    expect(block.textContent).toContain('23')
    expect(block.textContent).toContain('de 80 inscriptos')
    // Tres nombres + resto agrupado: la portada no se vuelve una lista.
    expect(block.textContent).toContain('Camila R.')
    expect(block.textContent).toContain('Sofía L.')
    expect(block.textContent).not.toContain('Bruno M.')
    expect(block.textContent).toContain('+1')

    const fill = block.querySelector('.pitbull-spotlight__home-live-fill')
    expect(fill.style.inlineSize).toBe('29%')
  })

  it('con cero inscriptos no pinta un contador vacío', async () => {
    fetchSummary.mockResolvedValue({ capacity: 80, registered: 0, remaining: 80, recent: [] })

    renderHome(eventFor('meet-sin-inscriptos', 'Meet sin inscriptos'))

    await waitFor(() => expect(fetchSummary).toHaveBeenCalledWith('meet-sin-inscriptos'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector('.pitbull-spotlight__home-live')).toBeNull()
  })

  it('sin backend disponible no inventa inscriptos con el cupo de referencia', async () => {
    fetchSummary.mockRejectedValue(new Error('sin red'))

    renderHome(eventFor('meet-sin-backend', 'Meet sin backend'))

    await waitFor(() => expect(fetchSummary).toHaveBeenCalledWith('meet-sin-backend'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector('.pitbull-spotlight__home-live')).toBeNull()
    // La portada sigue en pie: el título del evento se muestra igual.
    expect(screen.getAllByText('Meet sin backend').length).toBeGreaterThan(0)
  })
})
