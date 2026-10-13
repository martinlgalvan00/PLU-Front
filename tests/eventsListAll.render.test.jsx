import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * El listado no recorta por año por su cuenta: «Próximos» son todos los que no
 * terminaron, sea cual sea su año, y los contadores de las pestañas son los
 * mismos en cualquiera. Cuando un filtro del usuario esconde eventos, el listado
 * lo dice en voz alta en vez de mostrar menos sin explicación.
 */
vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlatformFeatureToggles: vi.fn(async () => ({
    checkoutEnabled: true,
    environmentHolds: [],
    paymentChannels: {},
  })),
}))

const BASE = {
  description: '',
  venue: 'Club Central',
  location: 'Rosario',
  status: 'proximamente',
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 0,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
  published: true,
}

const EVENTS = [
  { ...BASE, id: 'e1', slug: 'copa-norte-2026', title: 'Copa Norte', dateISO: '2026-11-10' },
  { ...BASE, id: 'e2', slug: 'copa-sur-2027', title: 'Copa Sur', dateISO: '2027-03-12' },
  { ...BASE, id: 'e3', slug: 'copa-este-2027', title: 'Copa Este', dateISO: '2027-05-20', published: false },
]

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => cleanup())

function renderEvents() {
  render(
    <I18nProvider>
      <EventsSection adminEvents={EVENTS} canEdit canManageUsers={false} tickets={[]} />
    </I18nProvider>,
  )
}

const titles = () =>
  [...document.querySelectorAll('.admin-event-row__title')].map((node) => node.textContent)

describe('EventsSection — ver todos los eventos', () => {
  it('«Próximos» lista los eventos de todos los años, sin aviso de filtros', () => {
    renderEvents()

    expect(titles().sort()).toEqual(['Copa Este', 'Copa Norte', 'Copa Sur'])
    expect(document.querySelector('.admin-events__filter-note')).toBeNull()
  })

  it('los contadores de las pestañas no cambian al pasar de una a otra', () => {
    renderEvents()
    const counts = () =>
      screen.getAllByRole('tab').map((tab) => tab.textContent.replace(/\D+/g, ' ').trim())

    expect(counts()).toEqual(['3', '0', '3'])
    fireEvent.click(screen.getByRole('tab', { name: /todos/i }))
    expect(counts()).toEqual(['3', '0', '3'])
    expect(titles().sort()).toEqual(['Copa Este', 'Copa Norte', 'Copa Sur'])
  })

  it('una búsqueda avisa cuántos eventos esconde y los trae con un toque', () => {
    renderEvents()

    fireEvent.change(screen.getByLabelText('Buscar meet, sede o slug'), {
      target: { value: 'sur' },
    })
    expect(titles()).toEqual(['Copa Sur'])
    const note = document.querySelector('.admin-events__filter-note')
    expect(note?.textContent).toMatch(/Mostrando 1 de 3 eventos/)
    expect(note?.textContent).toMatch(/búsqueda «sur»/)

    fireEvent.click(within(note).getByRole('button', { name: 'Ver todos' }))

    expect(titles().sort()).toEqual(['Copa Este', 'Copa Norte', 'Copa Sur'])
    expect(document.querySelector('.admin-events__filter-note')).toBeNull()
  })
})
