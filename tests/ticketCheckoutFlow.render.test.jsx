import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import {
  fillAttendee,
  fillBuyer,
  goToPaymentStep,
  input,
  submitStep,
} from './helpers/ticketCheckoutSteps.js'

/**
 * El checkout de entradas va en tres pasos que se reemplazan: elegir cuántas
 * de cada tipo, completar los datos y pagar. Lo que se cuida acá es que cada
 * paso muestre sólo su tarea, que no se pueda avanzar con datos inválidos y
 * que volver no pierda nada de lo cargado.
 */

vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: () => <div data-testid="ticket-pass-preview" />,
}))
vi.mock('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx', () => ({
  default: () => <div data-testid="mp-embedded" />,
}))
vi.mock('../src/motion/MotionContentSwap.tsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

const TicketPurchaseSection = (await import('../src/components/ui/TicketPurchaseSection.jsx'))
  .default

const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }
const singlePricing = {
  eventDays: [],
  ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
  addons: [],
}
const multiPricing = {
  eventDays: [],
  ticketTypes: [
    { id: 'general', name: 'General', price: 20000 },
    { id: 'coach', name: 'Entrenadores', price: 10000 },
  ],
  addons: [],
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
        event={event}
        pricing={singlePricing}
        tickets={[]}
        createdOrder={null}
        onSubmit={() => {}}
        onUploadPaymentProof={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

const steps = () => screen.getByRole('navigation', { name: /pasos de la compra/i })
const currentStep = () => steps().querySelector('[aria-current="step"]')?.textContent ?? ''
const summary = () => screen.getByRole('complementary', { name: /tu compra/i })
const action = () => within(summary()).getByRole('button', { name: /continuar|pagar/i })
const stepHeading = () => screen.getByRole('heading', { level: 2 })

afterEach(cleanup)

describe('checkout de entradas en pasos', () => {
  it('arranca eligiendo entradas: sin datos ni medios de pago a la vista', () => {
    renderSection()
    expect(currentStep()).toMatch(/entradas/i)
    expect(stepHeading().textContent).toMatch(/elegí tus entradas/i)
    expect(input('buyer-email')).toBeNull()
    expect(document.querySelector('input[name="ticket-payment"]')).toBeNull()
  })

  it('con un solo tipo arranca en una entrada y el total ya la cuenta', () => {
    renderSection()
    expect(screen.getByRole('group', { name: /cantidad de general/i }).textContent).toContain('1')
    expect(summary().textContent).toMatch(/20\.000/)
  })

  it('con varios tipos arranca en cero y no deja seguir sin elegir', () => {
    renderSection({ pricing: multiPricing })
    expect(action().disabled).toBe(true)
    expect(summary().textContent).toMatch(/todavía no elegiste/i)

    fireEvent.click(screen.getByRole('button', { name: 'Sumar General' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar General' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar Entrenadores' }))

    expect(action().disabled).toBe(false)
    expect(summary().textContent).toMatch(/2×\s*General/)
    expect(summary().textContent).toMatch(/1×\s*Entrenadores/)
    expect(summary().textContent).toMatch(/50\.000/)
  })

  it('en el paso de datos hay una tarjeta por entrada, en el orden del catálogo', () => {
    renderSection({ pricing: multiPricing })
    fireEvent.click(screen.getByRole('button', { name: 'Sumar Entrenadores' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar General' }))
    submitStep()

    expect(currentStep()).toMatch(/tus datos/i)
    const cards = document.querySelectorAll('.ticket-purchase__attendee-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].textContent).toMatch(/General/)
    expect(cards[1].textContent).toMatch(/Entrenadores/)
  })

  it('no avanza al pago con un email inválido y marca el campo', () => {
    renderSection()
    submitStep()
    fillBuyer({ email: 'camila' })
    fillAttendee(0)
    submitStep()

    expect(currentStep()).toMatch(/tus datos/i)
    expect(input('buyer-email').getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('input[name="ticket-payment"]')).toBeNull()
  })

  it('con todo completo llega al pago y el botón pasa a pagar', () => {
    renderSection()
    goToPaymentStep()
    expect(currentStep()).toMatch(/pago/i)
    expect(document.querySelector('input[name="ticket-payment"]')).not.toBeNull()
    expect(action().textContent).toMatch(/pagar/i)
  })

  it('volver no pierde lo cargado', () => {
    renderSection()
    goToPaymentStep()
    fireEvent.click(screen.getByRole('button', { name: /^volver$/i }))

    expect(currentStep()).toMatch(/tus datos/i)
    expect(input('buyer-email').value).toBe('camila@example.com')
    expect(input('attendee-0-fullName').value).toBe('Asistente 1')
  })

  it('un paso ya hecho se puede reabrir desde la barra de pasos', () => {
    renderSection()
    goToPaymentStep()
    fireEvent.click(within(steps()).getByRole('button', { name: /volver a entradas/i }))
    expect(currentStep()).toMatch(/entradas/i)
    expect(screen.getByRole('group', { name: /cantidad de general/i }).textContent).toContain('1')
  })

  it('"Es para mí" copia el nombre de quien compra en la primera entrada', () => {
    renderSection()
    submitStep()
    fillBuyer({ name: 'Camila Rearte' })
    fireEvent.click(screen.getByRole('button', { name: /es para mí/i }))
    expect(input('attendee-0-fullName').value).toBe('Camila Rearte')
  })

  it('al restar se saca primero una entrada vacía, no una ya completada', () => {
    renderSection({ pricing: multiPricing })
    fireEvent.click(screen.getByRole('button', { name: 'Sumar General' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar General' }))
    submitStep()
    fillAttendee(0, { fullName: 'Primera Persona', dni: '30111222' })
    fireEvent.click(within(steps()).getByRole('button', { name: /volver a entradas/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Restar General' }))
    submitStep()

    expect(document.querySelectorAll('.ticket-purchase__attendee-card')).toHaveLength(1)
    expect(input('attendee-0-fullName').value).toBe('Primera Persona')
  })

  it('la variante no editorial sigue siendo un formulario único', () => {
    renderSection({ editorial: false })
    expect(screen.queryByRole('navigation', { name: /pasos de la compra/i })).toBeNull()
    expect(input('buyer-email')).not.toBeNull()
    expect(input('attendee-0-fullName')).not.toBeNull()
  })
})
