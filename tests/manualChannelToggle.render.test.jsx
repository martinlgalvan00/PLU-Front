import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Con el canal manual cerrado desde el panel, transferencia y efectivo no
 * pueden quedar visibles: el backend devuelve 409 y el atleta se enteraría
 * recién al enviar el formulario. Estos casos cubren las tres superficies que
 * ofrecen medio de pago.
 */
vi.mock('../src/config/env.js', () => ({
  env: {
    appUrl: 'http://localhost:5173',
    apiUrl: '',
    isDev: true,
    demoMode: false,
    supabase: { url: '', anonKey: '', configured: false },
    mercadoPago: { publicKey: '', configured: false },
    payments: { transferAlias: 'maximal.plu', transferCbu: '', transferHolder: 'Camila Pérez' },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
}))

const RegisterSettle = (await import('../src/components/checkout/RegisterSettle.jsx')).default
const TicketPurchaseSection = (
  await import('../src/components/ui/TicketPurchaseSection.jsx')
).default

afterEach(cleanup)

const TICKET_PRICING = {
  ticketTypes: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Día 1', price: 12000 }],
  addons: [],
}

function renderSettle(manualPaymentEnabled) {
  return render(
    <I18nProvider>
      <RegisterSettle
        manualPaymentEnabled={manualPaymentEnabled}
        paymentMethod="mercado_pago"
        showPayment
        onPaymentChange={() => {}}
      />
    </I18nProvider>,
  )
}

function renderTickets(manualPaymentEnabled) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
        showPassPreview={false}
        event={{ slug: 'pitbull-classic-2026', title: 'Pitbull Classic' }}
        manualPaymentEnabled={manualPaymentEnabled}
        pricing={TICKET_PRICING}
        tickets={[]}
        onSubmit={() => {}}
      />
    </I18nProvider>,
  )
}

/**
 * Por atributo `name` y no por rol: el escritorio de cobro marca su grupo con
 * `role="radiogroup"` y la sección de entradas usa un `fieldset` pelado, así que
 * el `name` del input es lo único común a las dos superficies.
 */
function paymentRadios(name) {
  return screen.getAllByRole('radio').filter((radio) => radio.getAttribute('name') === name)
}

function paymentLabels(name) {
  return paymentRadios(name)
    .map((radio) => radio.closest('label')?.textContent ?? '')
    .join(' | ')
}

const SETTLE_GROUP = 'paymentMethod'
const TICKET_GROUP = 'ticket-payment'

const values = (name) => paymentRadios(name).map((radio) => radio.value)

describe('canal manual en el checkout de afiliación e inscripción', () => {
  it('ofrece Mercado Pago, transferencia y efectivo con el canal abierto', () => {
    renderSettle(true)
    expect(values(SETTLE_GROUP)).toEqual(['mercado_pago', 'manual_link', 'cash_pitbull'])
    // La etiqueta tiene que ser el nombre del medio, no la clave de traducción.
    expect(paymentLabels(SETTLE_GROUP)).toContain('Efectivo en Pitbull')
    expect(paymentLabels(SETTLE_GROUP)).not.toContain('pages.register')
  })

  it('deja solo Mercado Pago con el canal cerrado', () => {
    renderSettle(false)
    // Un solo medio: cerrar el canal manual no puede dejar el checkout sin
    // ninguna forma de pagar.
    expect(values(SETTLE_GROUP)).toEqual(['mercado_pago'])
  })

  // Un código de promoción puede destrabar un canal y no el otro: el selector
  // tiene que ofrecer exactamente el que el código habilita.
  it('ofrece sólo transferencia cuando el código habilita ese canal', () => {
    render(
      <I18nProvider>
        <RegisterSettle
          paymentMethod="mercado_pago"
          showPayment
          transferEnabled
          onPaymentChange={() => {}}
        />
      </I18nProvider>,
    )
    expect(values(SETTLE_GROUP)).toEqual(['mercado_pago', 'manual_link'])
  })

  it('ofrece sólo efectivo cuando el código habilita ese canal', () => {
    render(
      <I18nProvider>
        <RegisterSettle
          cashEnabled
          paymentMethod="mercado_pago"
          showPayment
          onPaymentChange={() => {}}
        />
      </I18nProvider>,
    )
    expect(values(SETTLE_GROUP)).toEqual(['mercado_pago', 'cash_pitbull'])
  })
})

describe('canal manual en la compra de entradas', () => {
  it('ofrece transferencia con el canal abierto', () => {
    renderTickets(true)
    expect(values(TICKET_GROUP)).toEqual(['mercado_pago', 'transferencia'])
  })

  it('deja solo Mercado Pago con el canal cerrado', () => {
    renderTickets(false)
    expect(values(TICKET_GROUP)).toEqual(['mercado_pago'])
  })
})
