import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Los cuatro medios de la compra de entradas salen de la misma matriz de
 * canales. Lo que importa acá es que cada celda gobierne sólo su opción —
 * ofrecer una cerrada termina en un 409 con el formulario ya completo — y que
 * el monto en USD que se muestra sea el que la API va a cobrar, no una
 * conversión distinta.
 */

vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: () => <div data-testid="ticket-pass-preview" />,
}))
vi.mock('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx', () => ({
  default: () => <div data-testid="mp-embedded" />,
}))

const TicketPurchaseSection = (await import('../src/components/ui/TicketPurchaseSection.jsx'))
  .default

const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }

const pricing = {
  eventDays: [],
  ticketTypes: [{ id: 'general', name: 'General', price: 20000, wisePrice: 40 }],
  addons: [],
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
        showPassPreview={false}
        event={event}
        pricing={pricing}
        tickets={[]}
        createdOrder={null}
        onSubmit={() => {}}
        onUploadPaymentProof={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

const radio = (value) => document.querySelector(`input[name="ticket-payment"][value="${value}"]`)

afterEach(cleanup)

describe('medios de pago de la compra de entradas', () => {
  it('el efectivo sólo aparece con su celda abierta', () => {
    renderSection({ cashEnabled: false })
    expect(radio('cash_pitbull')).toBeNull()
    cleanup()

    renderSection({ cashEnabled: true })
    expect(radio('cash_pitbull')).not.toBeNull()
    expect(screen.getByText('Efectivo en Pitbull')).toBeTruthy()
  })

  it('cada celda gobierna sólo su opción', () => {
    renderSection({ mercadoPagoEnabled: true, manualPaymentEnabled: false, cashEnabled: true })
    expect(radio('mercado_pago')).not.toBeNull()
    expect(radio('transferencia')).toBeNull()
    expect(radio('cash_pitbull')).not.toBeNull()
    const wise = radio('wise_transfer')
    expect(wise).not.toBeNull()
    expect(wise.disabled).toBe(true)
    expect(screen.getByText('Próximamente')).toBeTruthy()
  })

  it('con Mercado Pago cerrado la selección cae al primer medio abierto', () => {
    renderSection({ mercadoPagoEnabled: false, manualPaymentEnabled: false, cashEnabled: true })
    expect(radio('cash_pitbull').checked).toBe(true)
  })

  it('Wise cerrado se anuncia como próximamente y no se puede elegir', () => {
    renderSection({ wiseEnabled: false })
    const wise = radio('wise_transfer')
    expect(wise.disabled).toBe(true)
    expect(wise.checked).toBe(false)
    expect(screen.getByText('Próximamente')).toBeTruthy()
    expect(screen.queryByText(/US\$|USD/)).toBeNull()
  })

  it('con el canal abierto pero sin USD cargado sigue en próximamente', () => {
    renderSection({
      wiseEnabled: true,
      pricing: {
        eventDays: [],
        ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
        addons: [],
      },
    })
    const wise = radio('wise_transfer')
    expect(wise.disabled).toBe(true)
    expect(screen.getByText('Próximamente')).toBeTruthy()
    expect(screen.queryByText(/US\$|USD/)).toBeNull()
  })

  it('Wise muestra el USD cargado en el panel, no la conversión del precio en pesos', () => {
    renderSection({ wiseEnabled: true })
    // 20.000 ARS convertidos darían otra cosa; el panel decidió USD 40.
    expect(radio('wise_transfer').disabled).toBe(false)
    expect(screen.getByText(/40/)).toBeTruthy()
    expect(screen.queryByText('Próximamente')).toBeNull()
  })
})

describe('instrucciones posteriores a la compra en efectivo', () => {
  const cashOrder = {
    type: 'tickets',
    orderId: 'tord-1',
    eventTitle: 'Pitbull Classic 2026',
    quantity: 1,
    amount: 20000,
    currency: 'ARS',
    paymentMethod: 'manual',
    manualPaymentChannel: 'cash_pitbull',
    reference: 'TORD-abc',
    status: 'pendiente',
    tickets: [],
  }

  it('no pide comprobante: el cobro fue en caja y no genera archivo', () => {
    renderSection({ cashEnabled: true, createdOrder: cashOrder })
    expect(screen.queryByText('Comprobante de pago')).toBeNull()
    expect(screen.getByText('Dónde pagar')).toBeTruthy()
  })

  it('la transferencia sí lo sigue pidiendo', () => {
    renderSection({
      createdOrder: { ...cashOrder, manualPaymentChannel: 'bank_transfer' },
    })
    expect(screen.queryByText('Dónde pagar')).toBeNull()
    expect(document.querySelector('.ticket-purchase__proof-upload')).not.toBeNull()
  })
})
