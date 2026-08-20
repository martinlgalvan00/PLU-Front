import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import ExclusiveOfferSection from '../src/pages/profile/ExclusiveOfferSection.jsx'

afterEach(cleanup)

const OFFER = {
  code: 'ONLY-PITBULL',
  kind: 'offer',
  appliesTo: 'combo',
  fixedPrice: 120000,
  fixedPriceManual: null,
  description: '',
  redeemed: false,
  startsAt: null,
  expiresAt: null,
  active: true,
  event: {
    slug: 'pitbull-classic',
    title: 'Pitbull Classic',
    registrationPrice: 65000,
    registrationManualPrice: null,
    currency: 'ARS',
  },
  comboOffer: { price: 150000, manualPrice: null, currency: 'ARS', active: true, audience: 'code' },
  membershipPlan: { code: 'plu-annual', name: 'Afiliación anual', price: 85000, currency: 'ARS' },
}

const CATALOG_EVENT = {
  slug: 'pitbull-classic',
  title: 'Pitbull Classic',
  date: '14 de marzo',
  venue: 'Estadio PLU',
  location: 'La Plata',
}

const COMPLETE_ATHLETE = {
  id: 'athlete-1',
  fullName: 'Ana Pérez',
  phone: '1122334455',
  city: 'La Plata',
  province: 'Buenos Aires',
  country: 'Argentina',
  gym: 'PLU',
  birthDate: '1995-01-01',
  sex: 'F',
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <ExclusiveOfferSection
        offer={OFFER}
        offers={[OFFER]}
        athlete={COMPLETE_ATHLETE}
        events={[CATALOG_EVENT]}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('ficha de oferta exclusiva', () => {
  it('el beneficio lidera la ficha y el código queda como llave verificable', () => {
    renderSection()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Tu oferta exclusiva')
    expect(screen.getByText('ONLY-PITBULL')).toBeTruthy()
    expect(screen.getByText('Código secreto canjeado')).toBeTruthy()
  })

  it('nombra el paquete y la inscripción concreta', () => {
    renderSection()
    expect(screen.getByText('Afiliación + Inscripción')).toBeTruthy()
    expect(screen.getByText('Pitbull Classic')).toBeTruthy()
    // Fecha, sede y ciudad salen del catálogo, no del payload: no se inventan.
    expect(screen.getByText('14 de marzo · Estadio PLU · La Plata')).toBeTruthy()
  })

  it('desglosa las partes, el precio de la oferta y el ahorro', () => {
    const { container } = renderSection()
    const rows = container.querySelectorAll('.account-offer__ledger-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Afiliación anual')
    expect(rows[1].textContent).toContain('Inscripción Pitbull Classic')
    expect(rows[2].classList.contains('account-offer__ledger-row--total')).toBe(true)
    expect(rows[2].textContent).toContain('Tu precio')
    expect(screen.getByText(/Ahorrás/)).toBeTruthy()
  })

  it('el desglose es una lista de definiciones, no una tabla de divs sueltos', () => {
    const { container } = renderSection()
    expect(container.querySelector('dl.account-offer__ledger')).toBeTruthy()
    expect(container.querySelectorAll('dl.account-offer__ledger dt')).toHaveLength(3)
    expect(container.querySelectorAll('dl.account-offer__ledger dd')).toHaveLength(3)
  })

  it('una sola acción principal, que lleva al checkout de esa inscripción', () => {
    const onSelectEvent = vi.fn()
    const { container } = renderSection({ onSelectEvent })
    expect(container.querySelectorAll('.account-offer__cta')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    expect(onSelectEvent).toHaveBeenCalledWith(CATALOG_EVENT)
  })

  it('si el catálogo local no trae el evento, igual manda al checkout de ESE evento y no a uno random', () => {
    // Regresión: cuando `catalogEvent` no matcheaba, el botón navegaba a
    // 'competition' sin evento y el atleta terminaba en el torneo que hubiera
    // seleccionado antes (u otro por defecto), a su precio de lista en vez del
    // de la oferta.
    const onSelectEvent = vi.fn()
    const onNavigate = vi.fn()
    renderSection({ onSelectEvent, onNavigate, events: [] })
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    expect(onSelectEvent).toHaveBeenCalledWith(OFFER.event)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('un perfil incompleto pide completarlo en vez de mandar al checkout', () => {
    const onSelectEvent = vi.fn()
    const onNavigateSection = vi.fn()
    renderSection({
      onSelectEvent,
      onNavigateSection,
      athlete: { id: 'athlete-2', fullName: 'Sin datos' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    expect(onSelectEvent).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Completar mis datos/ }))
    expect(onNavigateSection).toHaveBeenCalledWith('account-personal-data')
  })

  it('una oferta ya comprada deja de ofrecer el checkout y explica por qué', () => {
    renderSection({ offer: { ...OFFER, redeemed: true }, offers: [{ ...OFFER, redeemed: true }] })
    expect(screen.queryByRole('button', { name: /Procesar el pago de la oferta/ })).toBe(null)
    expect(screen.getByRole('status').textContent).toContain('Ya compraste esta oferta')
  })

  it('sin combo vigente no ofrece un checkout que va a fallar', () => {
    renderSection({ offer: { ...OFFER, comboOffer: { ...OFFER.comboOffer, active: false } } })
    expect(screen.queryByRole('button', { name: /Procesar el pago de la oferta/ })).toBe(null)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('sin oferta no renderiza nada', () => {
    const { container } = renderSection({ offer: null })
    expect(container.querySelector('#account-offer')).toBe(null)
  })

  it('la descripción cargada por Administración gana sobre el copy por defecto', () => {
    renderSection({ offer: { ...OFFER, description: 'Solo para el equipo Pitbull.' } })
    expect(screen.getByText('Solo para el equipo Pitbull.')).toBeTruthy()
  })

  it('no repite la misma oración como título y como bajada', () => {
    const sameText = 'Oferta secreta: afiliación PLU + inscripción al Pitbull Classic.'
    renderSection({
      offer: { ...OFFER, campaign: { name: sameText, description: sameText } },
    })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(sameText)
    expect(screen.getAllByText(sameText)).toHaveLength(1)
  })
})
