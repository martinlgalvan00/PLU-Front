import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretBundleSection.render.test.jsx — PLU ARG
 *
 * La ficha del código-paquete: el documento arriba, el trámite abajo y un solo
 * paso visible por vez. Es la única superficie donde el paquete se lee entero y
 * se termina de pagar, así que lo que se prueba es que cada estado muestre lo
 * suyo y que el submit mande exactamente lo que la RPC del combo necesita.
 */
const confirmAthleteManualPayment = vi.fn()
const deferAthleteFinancedPayment = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({
  confirmAthleteManualPayment,
  deferAthleteFinancedPayment,
}))

const SecretBundleSection = (await import('../src/pages/profile/SecretBundleSection.jsx')).default

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Agustín Di Santo',
  documentId: '30111222',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 93,
}

/** Un código-paquete tal como lo devuelve `athlete_list_offer_unlocks`. */
function bundleOffer(overrides = {}) {
  return {
    id: 'code-1',
    code: 'ONLY-PITBULL-GOLD',
    kind: 'fixed_price',
    appliesTo: 'combo',
    fixedPrice: 120000,
    fixedPriceManual: 120000,
    manualChannels: ['bank_transfer', 'cash_pitbull'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 14,
    expiresAt: null,
    remaining: null,
    purchase: null,
    membershipPlan: { id: 'plan-1', name: 'Afiliación PLU anual', price: 85000, currency: 'ARS' },
    event: {
      id: 'ev-1',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      registrationPrice: 45000,
      currency: 'ARS',
    },
    ...overrides,
  }
}

afterEach(cleanup)
beforeEach(() => {
  confirmAthleteManualPayment.mockReset()
  deferAthleteFinancedPayment.mockReset()
  window.sessionStorage.clear()
})

describe('la ficha del código-paquete', () => {
  it('cuenta el paquete entero: qué es, cuánto sale y con qué condiciones', () => {
    render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[bundleOffer()]} />
      </I18nProvider>,
    )

    // El código, en el mismo registro que un documento emitido.
    expect(screen.getByText('ONLY-PITBULL-GOLD')).toBeTruthy()
    // Qué se está comprando, en una sola frase.
    expect(screen.getByText(/Afiliación PLU anual \+ Pitbull Classic/)).toBeTruthy()
    // El ahorro contra la suma de las partes: 130.000 por separado, 120.000 el
    // paquete. Sin esto el precio pactado no se lee como una oferta.
    expect(screen.getByText(/Ahorrás/)).toBeTruthy()
    // Las condiciones que cambian la operación, no como notas al pie.
    expect(screen.getByText(/Sólo con transferencia · efectivo/)).toBeTruthy()
    expect(screen.getByText(/14 días para pagar/)).toBeTruthy()
  })

  it('precarga los datos competitivos del perfil en vez de volver a pedirlos', () => {
    render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[bundleOffer()]} />
      </I18nProvider>,
    )

    expect(screen.getByLabelText(/División/i).value).toBe('Open')
    expect(screen.getByLabelText(/Categoría/i).value).toBe('Raw')
    expect(screen.getByLabelText(/Peso declarado/i).value).toBe('93')
  })

  it('ofrece sólo los canales que el código habilita', () => {
    render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[bundleOffer()]} />
      </I18nProvider>,
    )

    // El código cerró la pasarela: ofrecerla sería prometer un medio que la RPC
    // rechaza con PLU28.
    expect(screen.queryByRole('radio', { name: /Mercado Pago/i })).toBe(null)
    expect(screen.getByRole('radio', { name: /transferencia/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /efectivo/i })).toBeTruthy()
  })

  it('cobra sin salir de la ficha, con los datos que la RPC del combo exige', async () => {
    const onStartOfferPayment = vi.fn(async () => ({ order: { id: 'order-1' } }))
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[bundleOffer()]}
          onStartOfferPayment={onStartOfferPayment}
        />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }))
    })

    await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalledTimes(1))
    const call = onStartOfferPayment.mock.calls[0][0]
    expect(call.paymentMethod).toBe('manual_link')
    expect(call.division).toBe('Open')
    expect(call.category).toBe('Raw')
    expect(call.bodyweightKg).toBe(93)
    expect(call.event.slug).toBe('pitbull-classic-2026')
    expect(call.offer.code).toBe('ONLY-PITBULL-GOLD')
  })

  it('no crea la orden con el perfil competitivo incompleto', async () => {
    const onStartOfferPayment = vi.fn()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={{ ...ATHLETE, division: '', category: '', estimatedWeight: null }}
          offers={[bundleOffer()]}
          onStartOfferPayment={onStartOfferPayment}
        />
      </I18nProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }))
    })

    expect(onStartOfferPayment).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/división, categoría y peso/i)
  })

  it('con el derecho ya otorgado manda la cuenta regresiva y retira el formulario', () => {
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString()
    render(
      <I18nProvider>
        <SecretBundleSection
          athlete={ATHLETE}
          offers={[
            bundleOffer({
              purchase: {
                orderId: 'order-1',
                status: 'pendiente',
                manualPaymentChannel: 'cash_pitbull',
                financingAllowed: true,
                manualPaymentDeclaredAt: null,
                financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
                financedEntitlementsRevokedAt: null,
                financedPaymentDueAt: dueAt,
              },
            }),
          ]}
        />
      </I18nProvider>,
    )

    // Comprado: no se vuelve a ofrecer comprarlo.
    expect(screen.queryByRole('button', { name: /Confirmar y pagar/i })).toBe(null)
    expect(screen.getByText(/Habilitado, con saldo/)).toBeTruthy()
    // La cuenta regresiva ya es una oración completa; la ficha sólo le suma la
    // consecuencia. Envolverla en otra frase daba "Te queda Te quedan 2 días…".
    expect(screen.getByText(/Te quedan .* Vencido el plazo se dan de baja/)).toBeTruthy()
  })

  it('sin ningún código canjeado no renderiza nada', () => {
    const { container } = render(
      <I18nProvider>
        <SecretBundleSection athlete={ATHLETE} offers={[]} />
      </I18nProvider>,
    )
    expect(container.textContent).toBe('')
  })
})

describe('bundleState — el paso del trámite se lee de la compra', () => {
  it('una orden cerrada devuelve el paquete al principio', async () => {
    const { bundleState } = await import('../src/pages/profile/SecretBundleSection.jsx')
    // El canje se libera con la orden (20260906100000): el código vuelve a estar
    // disponible, así que la ficha tiene que volver a ofrecerlo en vez de
    // quedarse mostrando un cobro muerto.
    expect(bundleState({ status: 'rechazado' })).toBe('ready')
    expect(bundleState({ status: 'cancelado' })).toBe('ready')
    expect(bundleState(null)).toBe('ready')
    expect(bundleState({ status: 'aprobado' })).toBe('settled')
    expect(bundleState({ status: 'validacion_manual' })).toBe('manual')
    expect(
      bundleState({ status: 'pendiente', financedEntitlementsAt: '2026-08-25T12:00:00.000Z' }),
    ).toBe('granted')
    // Revocado ya no es un derecho vigente: vuelve a ser una orden a cobrar.
    expect(
      bundleState({
        status: 'pendiente',
        financedEntitlementsAt: '2026-08-25T12:00:00.000Z',
        financedEntitlementsRevokedAt: '2026-09-08T12:00:00.000Z',
      }),
    ).toBe('manual')
  })
})
