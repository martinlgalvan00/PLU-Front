import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const checkoutState = vi.hoisted(() => ({
  ticketEnabled: false,
  ticketManualEnabled: false,
  channels: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
}))
const envState = vi.hoisted(() => ({
  ticketSalesEnabled: true,
  paidCheckoutEnabled: true,
}))

vi.mock('../src/hooks/useTicketAvailability.js', () => ({
  useTicketAvailability: () => null,
  useTicketCheckoutAvailability: () => checkoutState,
}))

vi.mock('../src/components/ui/ResponsivePhoto.jsx', () => ({ default: () => <div /> }))
vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: () => <div data-testid="ticket-pass-preview" />,
}))
vi.mock('../src/components/ui/TicketPurchaseSection.jsx', () => ({
  default: () => <div data-testid="ticket-purchase" />,
}))
vi.mock('../src/config/env.js', () => ({
  env: envState,
}))

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

beforeEach(() => {
  checkoutState.ticketEnabled = false
  checkoutState.ticketManualEnabled = false
  envState.ticketSalesEnabled = true
  envState.paidCheckoutEnabled = true
})

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

describe('TicketsPage con ventas habilitadas', () => {
  it('muestra el CTA de compra y el checkout, no el aviso de Próximamente', () => {
    checkoutState.ticketEnabled = true

    render(
      <I18nProvider>
        <TicketsPage event={event} onNavigate={() => {}} />
      </I18nProvider>,
    )

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('link', { name: /comprar entradas/i })).toBeTruthy()
    expect(screen.getByText(/reservá tu lugar/i)).toBeTruthy()
    expect(screen.getByTestId('ticket-purchase')).toBeTruthy()
  })

  it('respeta el freno de entorno aunque el panel tenga la venta abierta', () => {
    checkoutState.ticketEnabled = true
    envState.ticketSalesEnabled = false

    render(
      <I18nProvider>
        <TicketsPage event={event} onNavigate={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getAllByText(/próximamente/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /comprar entradas/i })).toBeNull()
  })

  it('compara accesos por zona, sin repetir Incluida por cada tipo', () => {
    checkoutState.ticketEnabled = true

    render(
      <I18nProvider>
        <TicketsPage
          event={{
            ...event,
            ticketTypes: [
              {
                id: 'tt-publico',
                name: 'Público',
                price: 15000,
                credentials: [{ label: 'General', zoneScopes: ['gate_tickets'] }],
              },
              {
                id: 'tt-entrenador',
                name: 'Entrenador',
                price: 35000,
                credentials: [
                  { label: 'General', zoneScopes: ['gate_tickets'] },
                  { label: 'ENTRENADOR', zoneScopes: ['athletes_coaches'] },
                ],
              },
            ],
          }}
          onNavigate={() => {}}
        />
      </I18nProvider>,
    )

    const board = document.querySelector('.tickets-page__access-board')
    expect(board).not.toBeNull()
    expect(board.textContent).toContain('Puerta general')
    expect(board.textContent).toContain('Todas las entradas')
    expect(board.textContent).toContain('Entrada en calor')
    expect(board.textContent).toContain('Entrenador')
    expect(board.textContent).toContain('No la abren')
    expect(board.textContent).toContain('Público')
    expect(board.querySelectorAll('.tickets-page__access-cell')).toHaveLength(0)
    expect(board.querySelector('.tickets-page__access-zone--all')).not.toBeNull()
    expect(board.querySelectorAll('.tickets-page__access-opens li').length).toBeGreaterThan(0)
  })
})
