import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import BuyerTicketsWallet from '../src/components/ui/BuyerTicketsWallet.jsx'

vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: ({ attendeeName }) => <div data-testid="ticket-pass-preview">{attendeeName}</div>,
}))

vi.mock('../src/services/eventCardService.js', () => ({
  generateEventCard: vi.fn(),
  downloadCard: vi.fn(),
  buildCardFilename: vi.fn(() => 'pase.png'),
  preloadEventCardCapture: vi.fn().mockResolvedValue({}),
}))

afterEach(cleanup)

function ticket(overrides = {}) {
  return {
    id: 'tk-1',
    attendeeName: 'Camila Rearte',
    attendeeDni: '30111222',
    ticketCode: 'TCK-1',
    qrToken: 'qr-1',
    gateCode: 'AB12CD',
    ...overrides,
  }
}

function renderWallet(props = {}) {
  return render(
    <I18nProvider>
      <BuyerTicketsWallet orderStatus="aprobado" tickets={[ticket()]} {...props} />
    </I18nProvider>,
  )
}

describe('BuyerTicketsWallet', () => {
  it('muestra el QR adelante y cambia de entrada sin listar todas', () => {
    renderWallet({
      tickets: [
        ticket(),
        ticket({ id: 'tk-2', attendeeName: 'Juan Perez', qrToken: 'qr-2', gateCode: 'ZX98QW' }),
      ],
    })

    expect(screen.getByTestId('ticket-pass-preview').textContent).toBe('Camila Rearte')
    expect(screen.getByText('1 de 2')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Entrada siguiente' }))

    expect(screen.getByTestId('ticket-pass-preview').textContent).toBe('Juan Perez')
    expect(screen.getByText('2 de 2')).toBeTruthy()
  })

  it('una compra sin pago acreditado no abre el pase', () => {
    renderWallet({ orderStatus: 'pendiente', tickets: [ticket()] })

    expect(screen.queryByTestId('ticket-pass-preview')).toBeNull()
    expect(screen.getByText('Camila Rearte')).toBeTruthy()
  })
})
