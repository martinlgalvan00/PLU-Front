import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/hooks/useTicketAvailability.js', () => ({
  useTicketAvailability: () => null,
  useTicketCheckoutAvailability: () => ({ ticketEnabled: false, ticketManualEnabled: false }),
}))

vi.mock('../src/components/ui/ResponsivePhoto.jsx', () => ({ default: () => <div /> }))
vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({ default: () => <div data-testid="ticket-pass-preview" /> }))

const TicketsPage = (await import('../src/pages/TicketsPage.jsx')).default

const event = {
  id: 'pitbull-classic-2026',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  date: '12 de diciembre',
  venue: 'Maximal Strength Club',
  pricing: { ticketsEnabled: true },
  eventDays: [],
  ticketTypes: [{ id: 'ticket-day', name: 'General', price: 10000 }],
}

afterEach(() => cleanup())

describe('TicketsPage con ventas suspendidas', () => {
  it('comunica Próximamente y no renderiza precios ni el formulario de compra', () => {
    render(
      <I18nProvider>
        <TicketsPage event={event} onNavigate={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getAllByText(/próximamente/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/elegí tu entrada/i)).toBeNull()
    expect(screen.queryByText(/reservá tu lugar/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /pagar/i })).toBeNull()
  })
})
