import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretOfferRedemption.render.test.jsx — PLU ARG
 *
 * Códigos promocionales DESDE LA PANTALLA DE AFILIACIÓN, después del retiro de
 * las ofertas exclusivas por código (20260915100000).
 *
 * La pantalla ya no intenta ningún unlock ni redirige a ninguna ficha secreta:
 * un descuento de afiliación se aplica acá, y un código de otro alcance
 * muestra el error del preview tal cual. El resolvedor universal (cuando está
 * disponible) es el que deriva un código de inscripción/combo a su checkout —
 * eso se cubre en los tests del resolvedor, no acá: este archivo mockea
 * `athleteApi` sin `redeemPromotionCodeRequest`, así que el resolvedor falla y
 * la pantalla cae al camino del preview.
 */

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: vi.fn(),
  Payment: () => <div data-testid="mp-payment-brick" />,
  CardPayment: () => <div data-testid="mp-card-brick" />,
  Wallet: () => <div data-testid="mp-wallet-brick" />,
}))

vi.mock('../src/services/athleteApi.js', () => ({
  // El alta y la ficha personal piden el listado de gimnasios al montar
  // (RegisterPage / PersonalDataSection). Omitirlo en el doble no desvia el
  // test a otra rama: revienta el render entero con "No fetchGyms export is
  // defined on the mock".
  fetchGyms: vi.fn(async () => []),
  previewDiscountCode: vi.fn(),
  unlockOfferCode: vi.fn(),
  resendAthleteVerification: vi.fn(),
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

vi.mock('../src/config/env.js', () => ({
  env: {
    appUrl: 'http://localhost:5173',
    apiUrl: '',
    isDev: true,
    demoMode: false,
    supabase: { url: '', anonKey: '', configured: false },
    mercadoPago: { publicKey: 'APP_USR-test-public-key', configured: true },
    payments: { transferAlias: 'plu.arg', transferCbu: '', transferHolder: '' },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
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

const MembershipPurchaseSection = (
  await import('../src/pages/profile/MembershipPurchaseSection.jsx')
).default
const { previewDiscountCode, unlockOfferCode } = await import('../src/services/athleteApi.js')

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  photoUrl: null,
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000001',
}

// Lo que devuelve la RPC cuando el código es de otro alcance (inscripción o
// combo) y se lo previsualiza contra una afiliación suelta.
const NOT_APPLICABLE = {
  valid: false,
  reason: 'not_applicable',
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <MembershipPurchaseSection
        athlete={ATHLETE}
        membership={null}
        onActivateMembership={vi.fn()}
        onCancelMembership={vi.fn()}
        onStartMembershipPayment={vi.fn()}
        events={[]}
        checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
        {...props}
      />
    </I18nProvider>,
  )
}

async function typeCode(code) {
  fireEvent.click(await screen.findByRole('button', { name: /Tengo un código/i }))
  const input = await screen.findByLabelText(/^Código$/i)
  expect(screen.getByText(/^Canjeá tu código\.$/i)).toBeTruthy()
  fireEvent.change(input, { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(unlockOfferCode).mockReset()
  // El preview automático de promo pública corre en un efecto y no debe
  // interferir con el que dispara el botón.
  vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'no_public_promo' })
})

describe('códigos promocionales desde Afiliación', () => {
  it('un código de otro alcance muestra el error del preview, sin unlock ni redirección', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue(NOT_APPLICABLE)
    renderSection()

    await typeCode('only-pitbull')

    await waitFor(() => expect(screen.getByText('Ese código no aplica a este pago.')).toBeTruthy())
    // Las ofertas exclusivas están retiradas: nada intenta canjear una llave
    // ni anunciar una pestaña secreta.
    expect(unlockOfferCode).not.toHaveBeenCalled()
    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
    expect(screen.queryByText('Redirigiéndote a tu pestaña secreta…')).toBe(null)
  })

  it('un código de combo no desbloquea nada y dice que es del paquete', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue({
      valid: false,
      reason: 'not_applicable',
      kind: 'fixed_price',
      appliesTo: 'combo',
    })
    renderSection()

    await typeCode('COMBO150')

    // El preview devuelve el alcance (`appliesTo`) y la pantalla lo usa para
    // decir de qué es el código, en vez del "no aplica a este pago" seco que
    // dejaba al atleta sin saber dónde usarlo (`describeDiscountPreviewError`).
    await waitFor(() =>
      expect(screen.getByText(/Ese código es del combo \(afiliación \+ inscripción juntas\)/)).toBeTruthy(),
    )
    expect(unlockOfferCode).not.toHaveBeenCalled()
  })

  it('un código retirado se rechaza con el motivo del preview', async () => {
    // El servidor colapsa `inactive` en `not_found`: un código apagado es,
    // para el público, indistinguible de uno que nunca existió.
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'not_found' })
    renderSection()

    await typeCode('ONLY-PITBULL')

    await waitFor(() => expect(screen.getByText('Ese código no existe.')).toBeTruthy())
    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
  })

  it('un descuento normal sigue aplicándose como descuento, sin anuncio de canje', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue({
      valid: true,
      kind: 'percent',
      code: 'DESC10',
      discountAmount: 8500,
      finalAmount: 76500,
      manualChannels: [],
    })
    renderSection()

    await typeCode('DESC10')

    await waitFor(() => expect(screen.getByText(/DESC10/)).toBeTruthy())
    expect(unlockOfferCode).not.toHaveBeenCalled()
    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
  })
})
