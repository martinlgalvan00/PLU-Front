import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { input, submitStep } from './helpers/ticketCheckoutSteps.js'

/**
 * Los datos de quien compra no se pedían: la orden viajaba sin `buyer`, así que
 * `ticket_orders.buyer_email` quedaba en null y no había a quién mandarle el QR
 * ni a quién avisarle cuando Finanzas acreditaba. Lo que se prueba acá es que
 * el email sea obligatorio y que efectivamente llegue al submit.
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

const pricing = {
  eventDays: [],
  ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
  addons: [],
}

function renderSection(onSubmit, props = {}) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
        event={event}
        pricing={pricing}
        tickets={[]}
        createdOrder={null}
        onSubmit={onSubmit}
        onUploadPaymentProof={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

/**
 * Recorre el checkout como una persona: del paso de entradas al de datos,
 * completa y deja la compra en el paso de pago, lista para enviar.
 */
function fillValidPurchase({ beforeContinue } = {}) {
  submitStep()
  fireEvent.change(input('buyer-name'), { target: { value: 'Camila Rearte' } })
  fireEvent.change(input('buyer-email'), { target: { value: 'camila@example.com' } })
  fireEvent.change(input('attendee-0-fullName'), { target: { value: 'Julián Mas' } })
  fireEvent.change(input('attendee-0-dni'), { target: { value: '30111222' } })
  beforeContinue?.()
  submitStep()
}

const submit = submitStep

afterEach(cleanup)

describe('datos del comprador', () => {
  it('el formulario los pide', () => {
    renderSection(() => {})
    submitStep()
    expect(input('buyer-name')).not.toBeNull()
    expect(input('buyer-email')).not.toBeNull()
    expect(input('buyer-phone')).not.toBeNull()
  })

  it('sin email válido no se envía la compra', async () => {
    const onSubmit = vi.fn()
    renderSection(onSubmit)
    submitStep()
    fireEvent.change(input('buyer-name'), { target: { value: 'Camila Rearte' } })
    fireEvent.change(input('buyer-email'), { target: { value: 'camila' } })
    fireEvent.change(input('attendee-0-fullName'), { target: { value: 'Julián Mas' } })
    fireEvent.change(input('attendee-0-dni'), { target: { value: '30111222' } })
    submit()

    await waitFor(() => expect(input('buyer-email').getAttribute('aria-invalid')).toBe('true'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('el teléfono es opcional', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    renderSection(onSubmit)
    fillValidPurchase()
    submit()

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][4]).toEqual({
      name: 'Camila Rearte',
      email: 'camila@example.com',
      phone: undefined,
    })
  })

  it('el comprador viaja al submit junto con los asistentes', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    renderSection(onSubmit)
    fillValidPurchase({
      beforeContinue: () =>
        fireEvent.change(input('buyer-phone'), { target: { value: '1155551234' } }),
    })
    submit()

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const [, submittedEvent, attendees, paymentMethod, buyer] = onSubmit.mock.calls[0]
    expect(submittedEvent.slug).toBe('pitbull-classic-2026')
    expect(attendees[0]).toMatchObject({ fullName: 'Julián Mas', dni: '30111222' })
    expect(paymentMethod).toBe('mercado_pago')
    expect(buyer).toEqual({
      name: 'Camila Rearte',
      email: 'camila@example.com',
      phone: '1155551234',
    })
  })
})

/**
 * Un tipo puede salir de venta con el formulario abierto — se cerró su ventana
 * propia, o alguien lo desactivó — y entonces su opción desaparece del select.
 * El asistente quedaba apuntando a algo que ya no está y el envío moría en
 * "Seleccioná un tipo de entrada válido" sin nada marcado que lo explicara.
 */
describe('reconciliación con el catálogo a la venta', () => {
  it('reasigna al primer tipo disponible cuando el elegido deja de venderse', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    const { rerender } = renderSection(onSubmit, {
      pricing: {
        eventDays: [],
        addons: [],
        ticketTypes: [
          { id: 'preventa', name: 'Preventa', price: 15000 },
          { id: 'general', name: 'General', price: 20000 },
        ],
      },
    })
    // Con dos tipos se arranca en cero: la persona elige la preventa.
    fireEvent.click(screen.getByRole('button', { name: 'Sumar Preventa' }))

    rerender(
      <I18nProvider>
        <TicketPurchaseSection
          editorial
            event={event}
          pricing={{
            eventDays: [],
            addons: [],
            ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
          }}
          tickets={[]}
          createdOrder={null}
          onSubmit={onSubmit}
          onUploadPaymentProof={() => {}}
        />
      </I18nProvider>,
    )

    fillValidPurchase()
    submit()

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][2][0].ticketTypeId).toBe('general')
  })

  it('con el catálogo vacío al montar toma el tipo en cuanto llega', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    const { rerender } = renderSection(onSubmit, {
      pricing: { eventDays: [], addons: [], ticketTypes: [] },
    })

    rerender(
      <I18nProvider>
        <TicketPurchaseSection
          editorial
            event={event}
          pricing={pricing}
          tickets={[]}
          createdOrder={null}
          onSubmit={onSubmit}
          onUploadPaymentProof={() => {}}
        />
      </I18nProvider>,
    )

    fillValidPurchase()
    submit()

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][2][0].ticketTypeId).toBe('general')
  })
})

describe('validateTicketBuyer', () => {
  it('rechaza el email que la base también rechaza', async () => {
    const { validateTicketBuyer } = await import('../src/lib/validation.js')
    for (const email of ['a.com', 'a b@c.com', 'a@b', '']) {
      expect(validateTicketBuyer({ name: 'Ana Diaz', email }).success, email).toBe(false)
    }
    expect(validateTicketBuyer({ name: 'Ana Diaz', email: 'ana.diaz+plu@gmail.com' }).success).toBe(
      true,
    )
  })

  it('acepta el teléfono vacío y rechaza uno demasiado corto', async () => {
    const { validateTicketBuyer } = await import('../src/lib/validation.js')
    const base = { name: 'Ana Diaz', email: 'ana@example.com' }
    expect(validateTicketBuyer({ ...base, phone: '' }).success).toBe(true)
    expect(validateTicketBuyer({ ...base, phone: '123' }).success).toBe(false)
    expect(validateTicketBuyer({ ...base, phone: '11 5555 1234' }).success).toBe(true)
  })
})

describe('elegir tipos de entrada', () => {
  const multiTypePricing = {
    eventDays: [],
    addons: [],
    ticketTypes: [
      {
        id: 'publico-d1',
        name: 'Público general día 1',
        price: 15000,
        zoneScopes: ['gate_tickets'],
        credentialCount: 1,
      },
      {
        id: 'entrenador-d1',
        name: 'Entrenador día 1',
        price: 18000,
        zoneScopes: ['gate_tickets', 'athletes_coaches'],
        credentialCount: 2,
      },
    ],
  }

  it('cada tipo lleva su contador en el mismo catálogo, sin select por asistente', () => {
    renderSection(() => {}, { pricing: multiTypePricing })

    expect(document.querySelector('.ticket-type-options--picker')).not.toBeNull()
    expect(document.querySelectorAll('select')).toHaveLength(0)
    expect(screen.getByRole('group', { name: /cantidad de público general día 1/i })).toBeTruthy()
    expect(screen.getByRole('group', { name: /cantidad de entrenador día 1/i })).toBeTruthy()
    // Lo que abre cada una se lee antes de elegir, no después de pagar.
    expect(document.body.textContent).toContain('Entrada en calor')
    expect(document.body.textContent).toContain('2 credenciales · 2 QR')
  })

  it('la entrada elegida llega al paso de datos con su tipo y su precio', () => {
    renderSection(() => {}, { pricing: multiTypePricing })
    fireEvent.click(screen.getByRole('button', { name: 'Sumar Entrenador día 1' }))
    submitStep()

    const card = document.querySelector('.ticket-purchase__attendee-card')
    expect(card.textContent).toContain('Entrenador día 1')
    expect(card.textContent).toContain('18.000')
  })
})
