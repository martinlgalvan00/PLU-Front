import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/eventAdminService.js', () => ({
  fetchPublishedEvents: vi.fn(async () => []),
}))

const EventsPage = (await import('../src/pages/EventsPage.jsx')).default
const TicketsPage = (await import('../src/pages/TicketsPage.jsx')).default

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
})

afterEach(() => {
  cleanup()
})

const meet = {
  slug: 'regional-norte-2026',
  title: 'Regional Norte',
  date: '12 dic',
  dateISO: '2026-12-12',
  venue: 'PLU',
  location: 'Banfield',
  status: 'inscripcion_abierta',
  published: true,
  pricing: { ticketsEnabled: true },
  eventDays: [{ dayIndex: 0, label: 'Día 1' }],
  ticketTypes: [{ id: 'general', name: 'General', price: 0, active: true }],
}

const REASON = 'Las entradas están habilitadas. Falta publicar un precio.'

describe('calendario y compra dicen el mismo corte', () => {
  it('con el interruptor prendido y sin precio, ninguno dice que las entradas están deshabilitadas', async () => {
    const calendar = render(
      <I18nProvider>
        <EventsPage events={[meet]} onNavigate={vi.fn()} onSelectEvent={vi.fn()} session={null} />
      </I18nProvider>,
    )
    const tickets = render(
      <I18nProvider>
        <TicketsPage event={meet} events={[meet]} onNavigate={vi.fn()} />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(calendar.container.textContent).toContain(REASON)
    })
    expect(tickets.container.textContent).toContain(REASON)
    expect(calendar.container.textContent).not.toContain('todavía no está habilitada')
    expect(tickets.container.textContent).not.toContain('todavía no está habilitada')
  })
})
