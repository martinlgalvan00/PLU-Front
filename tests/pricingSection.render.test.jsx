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

  it('muestra el estado de cada versión y deja armar la oferta combo', () => {
    renderPricing()
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Oferta combo' })).toBeTruthy()
    expect(screen.getByLabelText('Evento')).toBeTruthy()
    expect(screen.getByLabelText('Plan incluido')).toBeTruthy()
    expect(screen.getByLabelText('Precio combo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar oferta' })).toBeTruthy()
  })
})
