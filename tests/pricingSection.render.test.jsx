import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PricingSection from '../src/pages/admin/PricingSection.jsx'

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(cleanup)

const configuration = {
  availability: { editable: true, reason: null },
  plans: [
    {
      id: 'plan-active',
      familyCode: 'plu-annual',
      version: 6,
      name: 'Afiliacion PLU anual',
      description: '',
      price: 1,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-14T00:00:00.000Z',
      retiredAt: null,
      active: true,
    },
    {
      id: 'plan-inactive',
      familyCode: 'plu-annual',
      version: 5,
      name: 'Afiliacion PLU anual',
      description: '',
      price: 75000,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-13T00:00:00.000Z',
      retiredAt: '2026-08-14T00:00:00.000Z',
      active: false,
    },
  ],
  events: [
    {
      id: 'event-1',
      slug: 'pitbull-classic',
      title: 'Pitbull Classic',
      registrationPrice: 1,
      currency: 'ARS',
      comboOffer: null,
    },
  ],
}

function renderPricing(props = {}) {
  return render(
    <I18nProvider>
      <PricingSection
        canEdit
        configuration={configuration}
        onCreatePlanVersion={vi.fn(async () => ({}))}
        onRefresh={vi.fn()}
        onSaveComboOffer={vi.fn(async () => ({}))}
        onSetPlanActive={vi.fn(async () => ({}))}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('Tarifas — alta de planes y combo', () => {
  it('abre el formulario de plan nuevo desde el CTA principal', () => {
    renderPricing()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo plan' }))
    expect(screen.getByRole('heading', { name: 'Publicar plan' })).toBeTruthy()
    expect(screen.getByLabelText(/Familia del plan/)).toBeTruthy()
    expect(screen.getByLabelText(/^Precio$/)).toBeTruthy()
  })

  it('publica una versión nueva en vez de editar el monto cobrado', () => {
    renderPricing()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nueva versión' })[0])
    expect(screen.getByRole('heading', { name: 'Nueva versión de Afiliacion PLU anual' })).toBeTruthy()
    expect(screen.getByLabelText(/Familia del plan/).disabled).toBe(true)
  })

  it('resume la oferta combo y abre su edición bajo demanda', () => {
    renderPricing()
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Oferta combo' })).toBeTruthy()
    expect(screen.getByText('Pitbull Classic')).toBeTruthy()
    expect(screen.queryByLabelText('Evento')).toBeNull()

    const disclosure = screen.getByRole('button', { name: /Editar oferta/ })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(disclosure)

    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Evento')).toBeTruthy()
    expect(screen.getByLabelText('Plan incluido')).toBeTruthy()
    expect(screen.getByLabelText('Precio combo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar oferta' })).toBeTruthy()
  })

  it('permite crear un código que aplique a afiliaciones e inscripciones', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.getByRole('heading', { name: 'Nuevo código de descuento' })).toBeTruthy()
    expect(screen.queryByText('Todavía no hay códigos de descuento.')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), { target: { value: 'club-25' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'both' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Límite de canjes/ }), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(expect.objectContaining({
      code: 'CLUB-25',
      percentOff: 25,
      appliesTo: 'both',
      maxRedemptions: 12,
    }))
  })

  it('muestra los canjes restantes y desactiva el control al agotar el cupón', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-first-ten',
            code: 'PRIMEROS-10',
            percentOff: 20,
            appliesTo: 'both',
            maxRedemptions: 10,
            redeemedCount: 10,
            active: false,
          },
        ],
      },
    })

    expect(screen.getByText('0 disponibles')).toBeTruthy()
    expect(screen.getAllByText('Agotado')).toHaveLength(2)
    expect(screen.getByRole('progressbar', { name: '0 de 10 cupos disponibles' })).toHaveProperty('value', 0)
    expect(screen.getAllByRole('checkbox').at(-1).disabled).toBe(true)
  })

  it('copia el código y confirma la acción en la misma fila', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-copy',
            code: 'CLUB-25',
            percentOff: 25,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copiar código CLUB-25' }))

    expect(writeText).toHaveBeenCalledWith('CLUB-25')
    expect(await screen.findByText('Copiado')).toBeTruthy()
  })

  it('presenta el estado vacío de suscripciones y conserva la actualización accesible', () => {
    renderPricing()

    expect(screen.getByText('Todavía no hay suscripciones activas.')).toBeTruthy()
    expect(screen.getByText(/Las afiliaciones recurrentes van a aparecer acá/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
})
