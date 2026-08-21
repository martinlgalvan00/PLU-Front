import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('una sola acción principal, y cobra sin salir de la pestaña', async () => {
    const onStartOfferPayment = vi.fn(async () => ({}))
    const onSelectEvent = vi.fn()
    const { container } = renderSection({ onStartOfferPayment, onSelectEvent })
    expect(container.querySelectorAll('.account-offer__cta')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText(/^Categoría/), { target: { value: '83' } })
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))

    await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalled())
    // El evento del catálogo (el que trae fecha y sede) y los datos de la
    // inscripción que el atleta acaba de confirmar.
    expect(onStartOfferPayment.mock.calls[0][0]).toMatchObject({
      offer: OFFER,
      event: CATALOG_EVENT,
      division: 'Open',
      category: 'Raw',
      bodyweightKg: 83,
    })
    // Nadie salió de la pestaña: el cobro es acá.
    expect(onSelectEvent).not.toHaveBeenCalled()
  })

  it('si el catálogo local no trae el evento, cobra el de ESA oferta y no uno random', async () => {
    // Regresión: cuando `catalogEvent` no matcheaba, la acción navegaba a
    // 'competition' sin evento y el atleta terminaba en el torneo que hubiera
    // seleccionado antes (u otro por defecto), a su precio de lista en vez del
    // de la oferta.
    const onStartOfferPayment = vi.fn(async () => ({}))
    renderSection({ onStartOfferPayment, events: [] })
    fireEvent.change(screen.getByLabelText(/^Categoría/), { target: { value: '83' } })
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))

    await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalled())
    expect(onStartOfferPayment.mock.calls[0][0].event).toEqual(OFFER.event)
  })

  it('con un solo medio no arma un selector de una opción', () => {
    renderSection()
    expect(screen.queryByRole('radiogroup', { name: /Cómo querés pagar/ })).toBe(null)
  })

  it('ya no manda al checkout de inscripción para pagar por otro medio', () => {
    // Ese salto perdía la oferta —el wizard no recibía el código— y dejaba al
    // atleta sin forma de pagar por transferencia. Ahora se paga acá.
    const onSelectEvent = vi.fn()
    renderSection({ onSelectEvent, events: [] })
    expect(screen.queryByRole('button', { name: /transferencia u otro medio/ })).toBe(null)
    expect(onSelectEvent).not.toHaveBeenCalled()
  })

  describe('medios que habilita el código', () => {
    const CASH_ONLY = {
      ...OFFER,
      mercadoPagoEnabled: false,
      manualChannels: ['cash_pitbull'],
      fixedPriceManual: 110000,
    }
    const THREE_CHANNELS = {
      ...OFFER,
      mercadoPagoEnabled: true,
      manualChannels: ['bank_transfer', 'cash_pitbull'],
    }

    it('un código sin Mercado Pago no lo ofrece ni lo deja elegir', () => {
      renderSection({ offer: CASH_ONLY, offers: [CASH_ONLY] })
      expect(screen.queryByRole('radio', { name: 'Mercado Pago' })).toBe(null)
      expect(screen.getByRole('button', { name: /Reservar y pagar en efectivo/ })).toBeTruthy()
    })

    it('cotiza el precio del canal, no el de la pasarela', () => {
      // `fixedPriceManual` es el importe pactado para transferencia y efectivo:
      // anunciar el de Mercado Pago sería anunciar un precio que no se cobra.
      const { container } = renderSection({ offer: CASH_ONLY, offers: [CASH_ONLY] })
      const total = container.querySelector('.account-offer__ledger-row--total dd')
      expect(total.textContent).toContain('110.000')
    })

    it('con los tres medios abiertos deja elegir y recotiza al cambiar', () => {
      renderSection({ offer: THREE_CHANNELS, offers: [THREE_CHANNELS] })
      expect(screen.getByRole('radio', { name: 'Mercado Pago' }).checked).toBe(true)
      fireEvent.click(screen.getByRole('radio', { name: 'Efectivo en el evento' }))
      expect(screen.getByRole('radio', { name: 'Efectivo en el evento' }).checked).toBe(true)
      expect(screen.getByRole('button', { name: /Reservar y pagar en efectivo/ })).toBeTruthy()
    })

    it('crea la orden con el medio elegido y no con Mercado Pago', async () => {
      const onStartOfferPayment = vi.fn(async () => ({}))
      renderSection({ offer: THREE_CHANNELS, offers: [THREE_CHANNELS], onStartOfferPayment })
      fireEvent.click(screen.getByRole('radio', { name: 'Transferencia bancaria' }))
      fireEvent.change(screen.getByLabelText(/^Categoría/), { target: { value: '83' } })
      fireEvent.click(screen.getByRole('button', { name: /Continuar con la transferencia/ }))

      await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalled())
      // `manual_link` es el nombre que usa la API para la transferencia.
      expect(onStartOfferPayment.mock.calls[0][0].paymentMethod).toBe('manual_link')
    })
  })

  it('no cobra con un peso corporal inválido', async () => {
    const onStartOfferPayment = vi.fn(async () => ({}))
    renderSection({ onStartOfferPayment })
    // Sin peso declarado el alta sería rechazada por el servidor: se corta acá
    // con el mismo mensaje que el checkout.
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    await waitFor(() => expect(screen.getByText(/peso entre 10 y 250 kg/)).toBeTruthy())
    expect(onStartOfferPayment).not.toHaveBeenCalled()
  })

  it('un perfil incompleto pide completarlo en vez de cobrar', () => {
    const onStartOfferPayment = vi.fn(async () => ({}))
    const onNavigateSection = vi.fn()
    renderSection({
      onStartOfferPayment,
      onNavigateSection,
      athlete: { id: 'athlete-2', fullName: 'Sin datos' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Procesar el pago de la oferta/ }))
    expect(onStartOfferPayment).not.toHaveBeenCalled()
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
