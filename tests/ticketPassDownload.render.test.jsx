import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * "Descargar entrada" tiene que guardar exactamente la misma pieza que se ve
 * en pantalla (el boarding-pass con el QR real), no un diseño distinto — por
 * eso rasteriza el nodo de TicketPassPreview con el mismo pipeline que ya usa
 * la card de inscripción (eventCardService + html2canvas), en vez de abrir
 * otra superficie.
 */

vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: () => <div data-testid="ticket-pass-preview" />,
}))
vi.mock('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx', () => ({
  default: () => <div data-testid="mp-embedded" />,
}))
vi.mock('../src/components/ui/CardPreviewModal.jsx', () => ({
  default: () => null,
}))

const generateEventCard = vi.fn()
const downloadCard = vi.fn()
const buildCardFilename = vi.fn(() => 'plu-arg-julian-mas-pitbull-classic-2026.png')
const preloadEventCardCapture = vi.fn().mockResolvedValue({})

vi.mock('../src/services/eventCardService.js', () => ({
  generateEventCard: (...args) => generateEventCard(...args),
  downloadCard: (...args) => downloadCard(...args),
  buildCardFilename: (...args) => buildCardFilename(...args),
  preloadEventCardCapture: (...args) => preloadEventCardCapture(...args),
}))

const TicketPurchaseSection = (await import('../src/components/ui/TicketPurchaseSection.jsx'))
  .default

const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }

const pricing = {
  eventDays: [],
  ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
  addons: [],
}

function ticket(overrides = {}) {
  return {
    id: 't1',
    orderId: 'order-1',
    ticketCode: 'PLU-0001',
    qrToken: 'qr-1',
    attendeeName: 'Julián Mas',
    attendeeDni: '30111222',
    ticketTypeId: 'general',
    ticketTypeName: 'General',
    status: 'pagada',
    isPrimaryCredential: true,
    credentialScopes: ['gate_tickets'],
    eventTitle: event.title,
    eventSlug: event.slug,
    ...overrides,
  }
}

function order(overrides = {}) {
  return {
    type: 'tickets',
    orderId: 'order-1',
    eventTitle: event.title,
    eventSlug: event.slug,
    quantity: 1,
    amount: 20000,
    currency: 'ARS',
    reference: 'TORD-abc123',
    paymentMethod: 'transferencia',
    status: 'aprobado',
    ...overrides,
  }
}

function renderSection({ createdOrder = order(), tickets = [ticket()] } = {}) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
        showPassPreview={false}
        event={event}
        pricing={pricing}
        tickets={tickets}
        createdOrder={createdOrder}
        onSubmit={() => {}}
        onUploadPaymentProof={() => {}}
      />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
  generateEventCard.mockReset()
  downloadCard.mockReset()
  buildCardFilename.mockClear()
})

describe('descargar entrada', () => {
  it('rasteriza el pase y dispara la descarga con el nombre de archivo de la credencial', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    generateEventCard.mockResolvedValue(blob)

    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Descargar entrada' }))

    await waitFor(() => expect(downloadCard).toHaveBeenCalledWith(blob, expect.any(String)))
    expect(generateEventCard).toHaveBeenCalledTimes(1)
    expect(buildCardFilename).toHaveBeenCalledWith('Julián Mas', 'pitbull-classic-2026', 'PLU-0001')
  })

  it('muestra un aviso si la captura falla, sin romper el resto de la pantalla', async () => {
    generateEventCard.mockRejectedValue(new Error('captura falló'))

    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Descargar entrada' }))

    await waitFor(() =>
      expect(screen.getByText('No pudimos generar la imagen. Probá de nuevo.')).toBeTruthy(),
    )
    expect(downloadCard).not.toHaveBeenCalled()
    // La pantalla sigue viva: el botón para ver la entrada sigue ahí.
    expect(screen.getByRole('button', { name: 'Ver mi entrada' })).toBeTruthy()
  })
})
