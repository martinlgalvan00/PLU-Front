import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * La compra de entradas pasa a ser uno de los momentos que festeja la
 * federación (ver celebration.js: CELEBRATION_MOMENTS ahora incluye
 * 'tickets'), igual que la afiliación acreditada, la credencial emitida y la
 * inscripción confirmada. El sello sólo puede aparecer con la orden
 * `aprobado` -- festejar un pago que el banco todavía puede rechazar sería
 * peor que no festejar nada.
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

function renderSection({ createdOrder, tickets = [ticket()] }) {
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

afterEach(cleanup)

describe('TicketPurchaseSection — festejo de compra', () => {
  it('muestra el sello de compra confirmada cuando la orden ya está aprobada', () => {
    renderSection({ createdOrder: order({ status: 'aprobado' }) })
    expect(screen.getByText('Compra confirmada')).toBeTruthy()
    expect(screen.getByText(/Tus entradas para Pitbull Classic 2026/)).toBeTruthy()
    // El encabezado plano (ícono + StatusPill) no convive con el sello: sería
    // el mismo hecho contado dos veces en la misma pantalla.
    expect(document.querySelector('.ticket-purchase__confirmation-head')).toBeNull()
  })

  it('no festeja una transferencia todavía pendiente de acreditación', () => {
    renderSection({
      createdOrder: order({ status: 'pendiente', paymentMethod: 'transferencia' }),
      tickets: [ticket({ status: 'pendiente_pago' })],
    })
    expect(screen.queryByText('Compra confirmada')).toBeNull()
    expect(document.querySelector('.ticket-purchase__confirmation-head')).toBeTruthy()
  })

  it('no festeja mientras Mercado Pago todavía está procesando', () => {
    renderSection({
      createdOrder: order({ status: 'pendiente', paymentMethod: 'mercado_pago' }),
      tickets: [ticket({ status: 'pendiente_pago' })],
    })
    expect(screen.queryByText('Compra confirmada')).toBeNull()
    expect(screen.getByTestId('mp-embedded')).toBeTruthy()
  })
})
