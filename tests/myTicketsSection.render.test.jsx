import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MyTicketsSection from '../src/pages/profile/MyTicketsSection.jsx'

/**
 * "Mis entradas": el QR es una credencial al portador. Se entrega sólo cuando
 * la entrada se vinculó por el mail verificado de la cuenta; vinculada por DNI
 * (que nadie verifica) se ve, pero sin QR ni código de puerta.
 */

afterEach(cleanup)

const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString()
const FUTURE_END = new Date(Date.now() + 6 * 86_400_000).toISOString()

function ticket(overrides = {}) {
  return {
    id: 't1',
    ticketCode: 'TCK-00000412',
    doorCode: '482913',
    qrToken: '6f1c1e0e-8f6b-4d7a-9a63-1d3b7b2a9c11',
    attendeeName: 'Ana Torres',
    attendeeDni: '30111222',
    credentialLabel: 'Entrada general',
    credentialScopes: ['gate_tickets'],
    status: 'pagada',
    eventSlug: 'pitbull-classic-2026',
    eventTitle: 'Pitbull Classic',
    eventDate: FUTURE,
    eventEndsAt: FUTURE_END,
    qrLocked: false,
    ...overrides,
  }
}

function renderWith(tickets) {
  return render(
    <I18nProvider>
      <MyTicketsSection loadTickets={async () => tickets} onNavigate={() => {}} />
    </I18nProvider>,
  )
}

describe('MyTicketsSection', () => {
  it('con el mail verificado ofrece el QR y muestra el código de puerta', async () => {
    renderWith([ticket()])
    fireEvent.click(await screen.findByRole('button', { name: /mostrar qr/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('482 913')).toBeTruthy()
  })

  it('vinculada sólo por DNI no ofrece el QR y dice adónde se mandó', async () => {
    renderWith([
      ticket({ qrLocked: true, qrToken: null, doorCode: null, buyerEmailMasked: 'a***@example.com' }),
    ])
    expect(await screen.findByText(/a\*\*\*@example\.com/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /mostrar qr/i })).toBeNull()
  })
})
