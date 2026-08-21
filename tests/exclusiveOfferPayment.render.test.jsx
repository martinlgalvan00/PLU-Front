import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * exclusiveOfferPayment.render.test.jsx — PLU ARG
 *
 * El cobro DENTRO de la pestaña secreta: la oferta de afiliación + inscripción
 * se paga sin salir de la ficha que la desbloqueó.
 *
 * El Brick se mockea a propósito: acá se verifica el contrato de la ficha con
 * él —qué orden le entrega y qué hace cuando el pago vuelve aprobado—, no el
 * Brick en sí, que tiene su propio archivo.
 */

const brickSpy = vi.fn()

vi.mock('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx', () => ({
  default: ({ order, onResult }) => {
    brickSpy(order)
    return (
      <div data-testid="offer-brick">
        <span data-testid="offer-brick-amount">{order?.amount}</span>
        <span data-testid="offer-brick-order">{order?.paymentId}</span>
        <button type="button" onClick={() => onResult?.({ status: 'approved' })}>
          simular aprobado
        </button>
      </div>
    )
  },
}))

const ExclusiveOfferSection = (await import('../src/pages/profile/ExclusiveOfferSection.jsx'))
  .default

const OFFER = {
  code: 'ONLY-PITBULL',
  kind: 'offer',
  appliesTo: 'combo',
  fixedPrice: 120000,
  redeemed: false,
  active: true,
  startsAt: null,
  expiresAt: null,
  event: {
    slug: 'pitbull-classic',
    title: 'Pitbull Classic',
    registrationPrice: 65000,
    currency: 'ARS',
  },
  comboOffer: { price: 150000, manualPrice: null, currency: 'ARS', active: true, audience: 'code' },
  membershipPlan: { code: 'plu-annual', name: 'Afiliación anual', price: 85000, currency: 'ARS' },
}

const CATALOG_EVENT = { slug: 'pitbull-classic', title: 'Pitbull Classic', date: '14 de marzo' }

const ATHLETE = {
  id: 'athlete-1',
  fullName: 'Ana Pérez',
  email: 'ana@plu.test',
  documentId: '30111222',
  phone: '1122334455',
  city: 'La Plata',
  province: 'Buenos Aires',
  country: 'Argentina',
  gym: 'PLU',
  birthDate: '1995-01-01',
  sex: 'F',
  division: 'Masters',
  category: 'Single-Ply',
  estimatedWeight: '93',
}

const CREATED_ORDER = {
  type: 'competition',
  purchaseType: 'combo',
  paymentId: 'order-new',
  amount: 120000,
  concept: 'Afiliación + inscripción Pitbull Classic',
  method: 'mercado_pago',
  paymentMode: 'payment',
}

function renderSection(props = {}) {
  const onStartOfferPayment = props.onStartOfferPayment ?? vi.fn(async () => ({}))
  return {
    onStartOfferPayment,
    ...render(
      <I18nProvider>
        <ExclusiveOfferSection
          offer={OFFER}
          offers={[OFFER]}
          athlete={ATHLETE}
          events={[CATALOG_EVENT]}
          checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
          {...props}
          onStartOfferPayment={onStartOfferPayment}
        />
      </I18nProvider>,
    ),
  }
}

afterEach(cleanup)
beforeEach(() => brickSpy.mockReset())

describe('cobro dentro de la pestaña secreta', () => {
  it('confirma de un vistazo los datos que ya dijo el perfil', () => {
    renderSection()
    // Con el perfil completo la ficha no muestra dos grillas de radios: muestra
    // lo que va a inscribir, en una línea.
    expect(screen.getByText('Masters · Single-Ply · 93 kg')).toBeTruthy()
    expect(screen.queryByLabelText(/Peso corporal/)).toBe(null)
  })

  it('el formulario se abre a pedido, con los datos del perfil cargados', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /Ajustar mis datos/ }))
    expect(screen.getByLabelText(/Peso corporal/).value).toBe('93')
    expect(screen.getByRole('radio', { name: 'Masters' }).checked).toBe(true)
    expect(screen.getByRole('radio', { name: 'Single-Ply' }).checked).toBe(true)
  })

  it('un perfil sin peso declarado abre el formulario solo', () => {
    renderSection({ athlete: { ...ATHLETE, estimatedWeight: '' } })
    expect(screen.getByLabelText(/Peso corporal/)).toBeTruthy()
  })

  it('crea la orden y abre el cobro en la misma ficha', async () => {
    const onStartOfferPayment = vi.fn(async () => ({ createdOrder: CREATED_ORDER }))
    const onSelectEvent = vi.fn()
    renderSection({ onStartOfferPayment, onSelectEvent })

    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    expect(await screen.findByTestId('offer-brick')).toBeTruthy()

    // El importe que se cobra es el de la orden que devolvió el servidor, no
    // uno recalculado en el navegador.
    expect(screen.getByTestId('offer-brick-amount').textContent).toBe('120000')
    expect(screen.getByTestId('offer-brick-order').textContent).toBe('order-new')
    // Y el atleta sigue en su pestaña.
    expect(onSelectEvent).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Volver al detalle/ })).toBeTruthy()
  })

  it('vuelve al detalle sin perder el cobro abierto', async () => {
    const onStartOfferPayment = vi.fn(async () => ({ createdOrder: CREATED_ORDER }))
    renderSection({ onStartOfferPayment })

    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    await screen.findByTestId('offer-brick')
    fireEvent.click(screen.getByRole('button', { name: /Volver al detalle/ }))

    expect(screen.getByText('Masters · Single-Ply · 93 kg')).toBeTruthy()
    // Volver a pagar reenvía el alta: la clave de idempotencia hace que el
    // servidor retome la orden que ya existe (y le aplique los datos de
    // inscripción si el atleta los cambió), en vez de abrir una segunda.
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalledTimes(2))
  })

  it('un error del alta se explica y no abre el cobro', async () => {
    const onStartOfferPayment = vi.fn(async () => ({ error: 'La inscripcion no esta abierta.' }))
    renderSection({ onStartOfferPayment })

    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('La inscripcion no esta abierta.')
    expect(screen.queryByTestId('offer-brick')).toBe(null)
  })

  it('el pago aprobado convierte la ficha en recibo y relee la oferta', async () => {
    const onStartOfferPayment = vi.fn(async () => ({ createdOrder: CREATED_ORDER }))
    const onOfferRefresh = vi.fn()
    renderSection({ onStartOfferPayment, onOfferRefresh })

    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    await screen.findByTestId('offer-brick')
    fireEvent.click(screen.getByRole('button', { name: /simular aprobado/ }))

    expect(await screen.findByText('Pago acreditado')).toBeTruthy()
    expect(onOfferRefresh).toHaveBeenCalled()
    expect(screen.getByText(/Ahorraste/)).toBeTruthy()
  })

  it('con el cobro cerrado por Administración no ofrece pagar', () => {
    renderSection({ checkoutAvailability: { registrationEnabled: false } })
    expect(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }).disabled).toBe(
      true,
    )
    expect(screen.getByText(/El cobro está cerrado por ahora/)).toBeTruthy()
  })
})

describe('compra iniciada y sin pagar', () => {
  const PENDING = {
    ...OFFER,
    redeemed: true,
    purchase: {
      orderId: 'order-pendiente',
      status: 'pendiente',
      amount: 120000,
      currency: 'ARS',
      concept: 'combo',
      method: 'mercado_pago',
    },
  }

  it('ya no dice "ya compraste": ofrece terminar de pagar ahí mismo', async () => {
    renderSection({ offer: PENDING, offers: [PENDING] })

    expect(screen.getByRole('status').textContent).toContain('espera el pago')
    expect(screen.queryByText(/Ya compraste esta oferta/)).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: /Terminar de pagar/ }))
    expect(await screen.findByTestId('offer-brick')).toBeTruthy()
    // Retoma la orden que ya existe, con su importe: no crea una nueva.
    expect(screen.getByTestId('offer-brick-order').textContent).toBe('order-pendiente')
    expect(screen.getByTestId('offer-brick-amount').textContent).toBe('120000')
  })

  it('una compra por transferencia no se cobra con el brick', () => {
    const manual = {
      ...PENDING,
      purchase: { ...PENDING.purchase, method: 'manual_link', status: 'validacion_manual' },
    }
    const onSelectEvent = vi.fn()
    renderSection({ offer: manual, offers: [manual], onSelectEvent })

    expect(screen.queryByRole('button', { name: /Terminar de pagar/ })).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: /Ver el estado de mi pago/ }))
    expect(onSelectEvent).toHaveBeenCalledWith(CATALOG_EVENT)
  })

  it('una compra aprobada sí es el recibo', () => {
    const paid = { ...PENDING, purchase: { ...PENDING.purchase, status: 'aprobado' } }
    renderSection({ offer: paid, offers: [paid] })
    expect(screen.getByRole('status').textContent).toContain('Ya compraste esta oferta')
  })
})
