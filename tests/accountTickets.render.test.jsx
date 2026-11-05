import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { walletsFromMine } from '../src/hooks/useAccountTickets.js'

const listMyTickets = vi.hoisted(() => vi.fn())

vi.mock('../src/services/ticketApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listMyTickets }
})

vi.mock('../src/hooks/useTicketAvailability.js', () => ({
  useTicketAvailability: () => null,
  useTicketCheckoutAvailability: () => ({
    ticketEnabled: false,
    ticketManualEnabled: false,
    channels: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
  }),
}))

vi.mock('../src/components/ui/ResponsivePhoto.jsx', () => ({ default: () => <div /> }))
vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: ({ attendeeName }) => <div>{attendeeName}</div>,
}))
vi.mock('../src/components/ui/TicketPurchaseSection.jsx', () => ({
  default: () => <div data-testid="ticket-purchase" />,
}))
vi.mock('../src/config/env.js', () => ({
  env: { ticketSalesEnabled: true, paidCheckoutEnabled: true },
}))

const TicketsPage = (await import('../src/pages/TicketsPage.jsx')).default
const AccountTicketsSection = (await import('../src/pages/profile/AccountTicketsSection.jsx')).default

const event = {
  id: 'pitbull-classic-2026',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  date: '12 de diciembre',
  venue: 'Maximal Strength Club',
  pricing: { ticketsEnabled: false },
  eventDays: [{ dayIndex: 0, label: 'Día 1' }],
  ticketTypes: [],
}

const session = { role: 'athlete_plu', athleteId: 'real-athlete', email: 'camila@example.com' }

function mineWithTicket() {
  return {
    orders: [
      {
        role: 'buyer',
        order: {
          status: 'aprobado',
          reference: 'TORD-1',
          eventTitle: 'Pitbull Classic 2026',
          eventSlug: 'pitbull-classic-2026',
          eventStartsAt: '2026-12-12T03:00:00.000Z',
          eventVenue: 'Maximal',
        },
        tickets: [
          {
            id: 'tk-1',
            orderId: 'order-1',
            attendeeName: 'Camila Rearte',
            attendeeDni: '30111222',
            status: 'pagada',
            qrToken: 'qr-1',
            gateCode: 'AB12CD',
            ticketCode: 'TCK-1',
          },
        ],
      },
    ],
    attendeeTickets: [],
  }
}

beforeEach(() => {
  listMyTickets.mockReset()
  listMyTickets.mockResolvedValue({ orders: [], attendeeTickets: [] })
})

afterEach(() => cleanup())

describe('Mis tickets en la página de entradas', () => {
  it('con sesión muestra las entradas de la cuenta y deja la búsqueda', async () => {
    listMyTickets.mockResolvedValue(mineWithTicket())
    render(
      <I18nProvider>
        <TicketsPage event={event} onNavigate={() => {}} session={session} />
      </I18nProvider>,
    )

    expect(await screen.findByText('Camila Rearte')).toBeTruthy()
    expect(screen.getByText(/estas son las entradas de tu cuenta/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /ya compraste/i })).toBeTruthy()
  })

  it('sin sesión no consulta la cuenta y explica el código y el mail', () => {
    render(
      <I18nProvider>
        <TicketsPage event={event} onNavigate={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getByText(/con el código de la compra y el mail/i)).toBeTruthy()
    expect(listMyTickets).not.toHaveBeenCalled()
  })
})

describe('ficha Mis tickets de la cuenta', () => {
  it('está vacía cuando la cuenta no tiene entradas', async () => {
    render(
      <I18nProvider>
        <AccountTicketsSection session={session} />
      </I18nProvider>,
    )

    expect(await screen.findByText('Todavía no hay entradas')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Mis tickets' })).toBeTruthy()
  })

  it('muestra la entrada que volvió de la cuenta', async () => {
    listMyTickets.mockResolvedValue(mineWithTicket())
    render(
      <I18nProvider>
        <AccountTicketsSection session={session} />
      </I18nProvider>,
    )

    expect(await screen.findByText('Camila Rearte')).toBeTruthy()
  })
})

describe('walletsFromMine', () => {
  it('agrupa las entradas del asistente por compra y no las mezcla con las del comprador', () => {
    const wallets = walletsFromMine({
      orders: mineWithTicket().orders,
      attendeeTickets: [
        {
          role: 'attendee',
          order: { status: 'aprobado', reference: 'TORD-2', eventTitle: 'Otro' },
          ticket: { id: 'tk-2', attendeeName: 'Otra', status: 'pagada' },
        },
      ],
    })
    expect(wallets.map((wallet) => wallet.key)).toEqual(['buyer-TORD-1', 'attendee-TORD-2'])
    expect(wallets[1].tickets[0].attendeeName).toBe('Otra')
  })
})
