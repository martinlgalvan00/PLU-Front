import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { input, submitStep } from './helpers/ticketCheckoutSteps.js'

/**
 * Comprar con la sesión abierta es comprar "como uno mismo": los datos de la
 * cuenta precargan el checkout y la compra termina en Mis entradas. El backend
 * la asocia por DNI del asistente o por mail de compra verificado
 * (`athlete_list_my_tickets`), y la pantalla tiene que decir cuál aplica.
 */

vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: () => <div data-testid="ticket-pass-preview" />,
}))
vi.mock('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx', () => ({
  default: () => <div data-testid="mp-embedded" />,
}))
vi.mock('../src/components/ui/CardPreviewModal.jsx', () => ({ default: () => null }))
vi.mock('../src/motion/MotionContentSwap.tsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

const TicketPurchaseSection = (await import('../src/components/ui/TicketPurchaseSection.jsx'))
  .default

const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }
const pricing = {
  eventDays: [],
  ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
  addons: [],
}
const account = {
  name: 'Camila Rearte',
  email: 'camila@example.com',
  dni: '30111222',
  emailVerified: true,
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
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

const order = {
  type: 'tickets',
  orderId: 'order-1',
  eventTitle: event.title,
  eventSlug: event.slug,
  quantity: 1,
  amount: 20000,
  currency: 'ARS',
  reference: 'TORD-abc123',
  paymentMethod: 'mercado_pago',
  status: 'aprobado',
}

afterEach(cleanup)

describe('compra con la cuenta abierta', () => {
  it('precarga nombre y mail de la cuenta', () => {
    renderSection({ account })
    submitStep()
    expect(input('buyer-name').value).toBe('Camila Rearte')
    expect(input('buyer-email').value).toBe('camila@example.com')
  })

  it('con el mail verificado de la cuenta avisa que toda la compra queda en el perfil', () => {
    renderSection({ account })
    submitStep()
    expect(screen.getByText(/toda esta compra va a quedar en tu perfil/i)).toBeTruthy()

    // Otro mail: sólo las entradas a su DNI quedan asociadas.
    fireEvent.change(input('buyer-email'), { target: { value: 'otro@example.com' } })
    expect(screen.getByText(/las entradas a tu dni van a quedar en tu perfil/i)).toBeTruthy()
  })

  it('con el mail sin verificar no promete la compra entera', () => {
    renderSection({ account: { ...account, emailVerified: false } })
    submitStep()
    expect(screen.queryByText(/toda esta compra/i)).toBeNull()
    expect(screen.getByText(/las entradas a tu dni/i)).toBeTruthy()
  })

  it('"Es para mí" completa nombre y DNI de la cuenta', () => {
    renderSection({ account })
    submitStep()
    fireEvent.click(screen.getByRole('button', { name: /es para mí/i }))
    expect(input('attendee-0-fullName').value).toBe('Camila Rearte')
    expect(input('attendee-0-dni').value).toBe('30111222')
  })

  it('sin sesión no muestra el aviso de la cuenta', () => {
    renderSection()
    submitStep()
    expect(input('buyer-email').value).toBe('')
    expect(screen.queryByText(/mis entradas/i)).toBeNull()
  })
})

describe('confirmación y Mis entradas', () => {
  it('con cuenta lleva a Mis entradas', () => {
    const onOpenMyTickets = vi.fn()
    renderSection({ account, createdOrder: order, onOpenMyTickets })
    fireEvent.click(screen.getByRole('button', { name: /ver en mis entradas/i }))
    expect(onOpenMyTickets).toHaveBeenCalled()
  })

  it('sin cuenta invita a crearla para guardar la entrada', () => {
    const onCreateAccount = vi.fn()
    renderSection({ createdOrder: order, onCreateAccount })
    expect(screen.queryByRole('button', { name: /ver en mis entradas/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /crear mi cuenta/i }))
    expect(onCreateAccount).toHaveBeenCalled()
  })
})
