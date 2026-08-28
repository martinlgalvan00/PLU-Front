import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * bundleTabHandoff.render.test.jsx — PLU ARG
 *
 * El camino completo del código-paquete (afiliación + inscripción) dentro de Mi
 * cuenta: se tipea en el checkout de Afiliación, el resolvedor lo reconoce y
 * manda a su ficha exclusiva (`open_bundle` → `profile / account-offer`,
 * 20260926100000), y ahí se termina de pagar con transferencia.
 *
 * Lo que se resguarda es el eslabón que no se veía en ninguna prueba: el canje
 * crea el desbloqueo DEL LADO DEL SERVIDOR, así que la lectura de códigos que
 * hizo la cuenta al montar ya está vieja cuando el checkout manda para acá.
 * Sin volver a leerla, la ficha se consideraba inexistente, el destino caía en
 * Torneos y no había manera de llegar al paquete sin recargar la página — con
 * el código ya canjeado y el cupo consumido.
 *
 * El segundo eslabón es el mismo problema del otro lado del trámite: la orden
 * recién creada es la que trae los datos bancarios, y sin releer la ficha
 * seguía mostrando el formulario de compra de algo que la persona acababa de
 * comprar.
 */

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  Element.prototype.scrollTo ??= function scrollTo() {}
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
})

vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: vi.fn(),
  Payment: () => <div data-testid="mp-payment-brick" />,
  CardPayment: () => <div data-testid="mp-card-brick" />,
  Wallet: () => <div data-testid="mp-wallet-brick" />,
}))

vi.mock('../src/config/env.js', () => ({
  env: {
    appUrl: 'http://localhost:5173',
    apiUrl: '',
    isDev: true,
    demoMode: false,
    supabase: { url: '', anonKey: '', configured: false },
    mercadoPago: { publicKey: 'APP_USR-test-public-key', configured: true },
    payments: { transferAlias: 'plu.arg', transferCbu: '0000076500000000000001', transferHolder: 'PLU ARG' },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
}))

vi.mock('../src/services/registrationAccessService.js', () => ({
  fetchRegistrationAccessRequirements: vi.fn(async () => ({
    membership: false,
    registration: false,
    membershipEnabled: true,
    registrationEnabled: true,
    membershipManualEnabled: true,
    registrationManualEnabled: true,
  })),
  verifyRegistrationAccessCode: vi.fn(),
}))

vi.mock('../src/services/paymentService.js', () => ({
  createPreference: vi.fn(async () => ({})),
  listMembershipPlans: vi.fn(async () => ({
    plans: [
      {
        code: 'plu-annual',
        name: 'Afiliación anual',
        price: 85000,
        currency: 'ARS',
        billingFrequency: 'annual',
        collectionMode: 'one_time',
      },
    ],
  })),
  isMercadoPagoConfigured: () => true,
  processEmbeddedPayment: vi.fn(),
  processEmbeddedSubscription: vi.fn(),
  getPaymentOrderStatus: vi.fn(),
}))

/*
 * `importOriginal` y no un doble entero: omitir una función de `athleteApi`
 * desvía el test a otra rama y lo deja verde. Sólo se reemplaza lo que este
 * flujo consulta de verdad.
 */
const fetchOfferUnlocks = vi.fn()
const previewDiscountCode = vi.fn()
const redeemPromotionCodeRequest = vi.fn()

vi.mock('../src/services/athleteApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchGyms: vi.fn(async () => []),
    fetchOfferUnlocks: (...args) => fetchOfferUnlocks(...args),
    previewDiscountCode: (...args) => previewDiscountCode(...args),
    redeemPromotionCodeRequest: (...args) => redeemPromotionCodeRequest(...args),
  }
})

const AthleteProfilePage = (await import('../src/pages/AthleteProfilePage.jsx')).default

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  emailVerifiedAt: '2026-01-02T00:00:00.000Z',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 72,
  photoUrl: null,
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000001',
}

/** Un código-paquete tal como lo devuelve `athlete_list_offer_unlocks`. */
function bundleOffer(purchase = null) {
  return {
    id: 'code-1',
    code: 'PITBULL-PACK',
    kind: 'fixed_price',
    appliesTo: 'combo',
    fixedPrice: 120000,
    fixedPriceManual: 120000,
    manualChannels: ['bank_transfer'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 14,
    remaining: null,
    expiresAt: null,
    purchase,
    membershipPlan: { id: 'plan-1', name: 'Afiliación PLU anual', price: 85000, currency: 'ARS' },
    event: {
      id: 'ev-1',
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      registrationPrice: 45000,
      currency: 'ARS',
    },
  }
}

/** Lo que contesta `athlete_redeem_promotion_code` para un código de combo. */
const RESOLVED_BUNDLE = {
  status: 'accepted',
  accepted: true,
  action: 'open_bundle',
  code: 'PITBULL-PACK',
  kind: 'fixed_price',
  appliesTo: 'combo',
  destination: { view: 'profile', tab: 'account-offer', eventSlug: 'pitbull-classic-2026' },
  campaign: { name: 'Pack Pitbull', objective: 'exclusive_offer' },
  benefit: {
    fixedPrice: 120000,
    manualChannels: ['bank_transfer'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 14,
  },
  offer: null,
}

function renderAccount(props = {}) {
  return render(
    <I18nProvider>
      <AthleteProfilePage
        athlete={ATHLETE}
        memberships={[]}
        registrations={[]}
        payments={[]}
        events={[]}
        session={{ role: 'athlete_plu', athleteId: 'ath-1' }}
        checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
        {...props}
      />
    </I18nProvider>,
  )
}

afterEach(cleanup)
beforeEach(() => {
  fetchOfferUnlocks.mockReset()
  previewDiscountCode.mockReset()
  redeemPromotionCodeRequest.mockReset()
  window.sessionStorage.clear()
})

describe('canje del código-paquete desde Afiliación', () => {
  it('abre la ficha del paquete aunque la cuenta ya hubiera leído que no había ninguno', async () => {
    // Al montar la cuenta esta persona no tenía ningún código: el desbloqueo lo
    // crea el canje, dos interacciones después.
    fetchOfferUnlocks.mockResolvedValueOnce([]).mockResolvedValue([bundleOffer()])
    redeemPromotionCodeRequest.mockResolvedValue(RESOLVED_BUNDLE)

    renderAccount({ initialTab: 'account-membership' })
    await waitFor(() => expect(fetchOfferUnlocks).toHaveBeenCalledTimes(1))

    const toggle = await screen.findByRole('button', { name: /tengo un código/i })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByLabelText(/^Código$/i), { target: { value: 'pitbull-pack' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    // El canje mandó a la ficha del paquete y la ficha se abrió con el paquete
    // adentro: el código, el precio pactado y el formulario para cerrarlo.
    await waitFor(() => expect(document.querySelector('#account-offer')).toBeTruthy())
    // Dentro de la ficha: el panel de Afiliación sigue montado un instante
    // mientras entra el nuevo (MotionContentSwap en modo `sync`) y también
    // tiene su fila de transferencia.
    const bundle = within(document.querySelector('#account-offer'))
    expect(bundle.getByText('PITBULL-PACK')).toBeTruthy()
    expect(bundle.getByRole('radio', { name: /transferencia/i })).toBeTruthy()
    // El código no se previsualiza contra una afiliación suelta: su alcance es
    // el paquete y el preview lo rechazaría por alcance. Las consultas sin
    // código son la promo pública del plan, que corre igual.
    expect(previewDiscountCode.mock.calls.map(([input]) => input?.code)).not.toContain(
      'PITBULL-PACK',
    )
  })

  it('con la orden creada muestra los datos de la transferencia, sin recargar', async () => {
    const purchase = {
      orderId: '11111111-1111-4111-8111-111111111111',
      status: 'pendiente',
      amount: 120000,
      currency: 'ARS',
      concept: 'combo',
      method: 'manual_link',
      manualPaymentChannel: 'bank_transfer',
      financingAllowed: true,
      manualPaymentDeclaredAt: null,
      financedEntitlementsAt: null,
      financedPaymentDueAt: null,
    }
    fetchOfferUnlocks
      .mockResolvedValueOnce([bundleOffer()])
      .mockResolvedValue([bundleOffer(purchase)])
    const onStartOfferPayment = vi.fn(async () => ({ payment: { id: purchase.orderId } }))

    renderAccount({ initialTab: 'account-offer', onStartOfferPayment })
    await waitFor(() => expect(document.querySelector('.bundle-section__form')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }))
    await waitFor(() => expect(onStartOfferPayment).toHaveBeenCalledTimes(1))
    expect(onStartOfferPayment.mock.calls[0][0].paymentMethod).toBe('manual_link')

    // La ficha pasa al paso siguiente sola: el formulario se retira y aparecen
    // los datos bancarios de la orden que se acaba de crear.
    await waitFor(() => expect(document.querySelector('.bundle-section__form')).toBe(null))
    expect(document.querySelector('.bundle-section__settle')).toBeTruthy()
    expect(screen.getByText(/plu\.arg/i)).toBeTruthy()
  })

  it('mientras la lectura no vuelve, la ficha se anuncia en vez de dejar el panel vacío', async () => {
    let release = null
    fetchOfferUnlocks.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([bundleOffer()])
        }),
    )

    renderAccount({ initialTab: 'account-offer' })

    // La ficha ya es la que está abierta: el título y el aviso de que se está
    // buscando, no Torneos ni un panel en blanco.
    await waitFor(() => expect(document.querySelector('#account-offer')).toBeTruthy())
    const opening = within(document.querySelector('#account-offer'))
    expect(opening.getByText('Tu paquete')).toBeTruthy()
    expect(opening.getByRole('status')).toBeTruthy()
    expect(document.querySelector('.account-section--events')).toBe(null)

    release()
    await waitFor(() =>
      expect(within(document.querySelector('#account-offer')).getByText('PITBULL-PACK')).toBeTruthy(),
    )
  })

  it('resuelve la lectura también bajo StrictMode, que monta dos veces', async () => {
    // El doble montaje de StrictMode corre el efecto, lo limpia y lo vuelve a
    // correr. Con un guardo de "sigue viva" que sólo se apaga, la respuesta del
    // servidor llegaba y no se guardaba nunca: la ficha quedaba anunciando que
    // buscaba el paquete para siempre. Pasa en desarrollo, no en el build.
    fetchOfferUnlocks.mockResolvedValue([bundleOffer()])

    render(
      <StrictMode>
        <I18nProvider>
          <AthleteProfilePage
            athlete={ATHLETE}
            memberships={[]}
            registrations={[]}
            payments={[]}
            events={[]}
            session={{ role: 'athlete_plu', athleteId: 'ath-1' }}
            checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
            initialTab="account-offer"
          />
        </I18nProvider>
      </StrictMode>,
    )

    await waitFor(() =>
      expect(within(document.querySelector('#account-offer')).getByText('PITBULL-PACK')).toBeTruthy(),
    )
    expect(document.querySelector('.bundle-section__form')).toBeTruthy()
  })

  it('sin ningún código canjeado la ficha no existe y el destino cae en Torneos', async () => {
    // La contracara: la espera es sólo mientras la lectura no volvió. Resuelta
    // en vacío, una pestaña que anuncia algo que no está sería peor que ninguna.
    fetchOfferUnlocks.mockResolvedValue([])

    renderAccount({ initialTab: 'account-offer' })
    await waitFor(() => expect(fetchOfferUnlocks).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('.account-section--events')).toBeTruthy())
    expect(document.querySelector('#account-offer')).toBe(null)
    expect(screen.queryByRole('tab', { name: /Tu código/i })).toBe(null)
  })
})
