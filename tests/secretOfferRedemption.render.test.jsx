import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretOfferRedemption.render.test.jsx — PLU ARG
 *
 * El canje del código secreto DESDE LA PANTALLA DE AFILIACIÓN, que es el caso
 * que no funcionaba antes de 20260902100000: el código de una oferta de combo
 * no aplica a una afiliación suelta, así que el preview lo rechazaba con
 * `not_applicable` y el atleta leía "ese código no aplica a este pago" — un
 * error, cuando ese es justamente el código que se le repartió.
 *
 * Lo que se verifica acá es la conclusión que espera la persona: que la
 * pantalla diga que canjeó el código secreto, lo nombre, y le dé la puerta a su
 * ficha de oferta exclusiva. El cobro no pasa por acá: la oferta se compra en el
 * checkout del torneo.
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

const OFFER_PAYLOAD = {
  code: 'ONLY-PITBULL',
  kind: 'offer',
  fixedPrice: 120000,
  event: { slug: 'pitbull-classic', title: 'Pitbull Classic' },
}

// Lo que devuelve la RPC cuando el código es de una oferta de combo y se lo
// previsualiza contra una afiliación suelta.
const NOT_APPLICABLE_OFFER = {
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

describe('canje del código secreto desde Afiliación', () => {
  it('anuncia el canje nombrando el código y ofrece la ficha de la oferta', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue(NOT_APPLICABLE_OFFER)
    vi.mocked(unlockOfferCode).mockResolvedValue({
      unlocked: true,
      alreadyUnlocked: false,
      offer: OFFER_PAYLOAD,
    })
    const onNavigateSection = vi.fn()
    const onOfferUnlocked = vi.fn()
    renderSection({ onNavigateSection, onOfferUnlocked })

    await typeCode('only-pitbull')

    expect(await screen.findByText('Redirigiéndote a tu pestaña secreta…')).toBeTruthy()
    // Lo que la persona vino a leer: que canjeó, y qué.
    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())
    expect(screen.getByText('ONLY-PITBULL')).toBeTruthy()
    expect(screen.getByText(/Pitbull Classic/)).toBeTruthy()

    // El código viaja normalizado a mayúsculas.
    expect(unlockOfferCode).toHaveBeenCalledWith({ code: 'ONLY-PITBULL' })
    // La cuenta recarga sus ofertas para que la ficha aparezca en la cinta y
    // el canje termina directamente en esa ficha secreta.
    expect(onOfferUnlocked).toHaveBeenCalled()
    expect(onNavigateSection).toHaveBeenCalledWith('account-offer')

    fireEvent.click(screen.getByRole('button', { name: /Ver mi oferta/i }))
    expect(onNavigateSection).toHaveBeenCalledWith('account-offer')
  })

  it('no muestra el error "no aplica" cuando el código sí desbloquea una oferta', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue(NOT_APPLICABLE_OFFER)
    vi.mocked(unlockOfferCode).mockResolvedValue({ unlocked: true, offer: OFFER_PAYLOAD })
    renderSection({ onNavigateSection: vi.fn(), onOfferUnlocked: vi.fn() })

    await typeCode('ONLY-PITBULL')

    expect(await screen.findByText('Redirigiéndote a tu pestaña secreta…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())
    expect(screen.queryByText('Ese código no aplica a este pago.')).toBe(null)
  })

  // Un cupón de precio fijo para el combo tampoco aplica a la afiliación, pero
  // no desbloquea ninguna pantalla: ahí el error seco es la respuesta correcta.
  it('un código que no desbloquea nada sigue mostrando el error del preview', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue({
      valid: false,
      reason: 'not_applicable',
      kind: 'fixed_price',
      appliesTo: 'combo',
    })
    vi.mocked(unlockOfferCode).mockResolvedValue({
      unlocked: false,
      reason: 'not_applicable',
    })
    renderSection({ onNavigateSection: vi.fn(), onOfferUnlocked: vi.fn() })

    await typeCode('COMBO150')

    await waitFor(() => expect(screen.getByText('Ese código no aplica a este pago.')).toBeTruthy())
    expect(unlockOfferCode).toHaveBeenCalledWith({ code: 'COMBO150' })
    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
  })

  it('un canje rechazado explica el motivo en vez de anunciar la oferta', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue(NOT_APPLICABLE_OFFER)
    vi.mocked(unlockOfferCode).mockResolvedValue({ unlocked: false, reason: 'limit_reached' })
    renderSection({ onNavigateSection: vi.fn(), onOfferUnlocked: vi.fn() })

    await typeCode('ONLY-PITBULL')

    await waitFor(() => expect(screen.getByText('Esa oferta agotó su cupo.')).toBeTruthy())
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
    renderSection({ onNavigateSection: vi.fn(), onOfferUnlocked: vi.fn() })

    await typeCode('DESC10')

    await waitFor(() => expect(screen.getByText(/DESC10/)).toBeTruthy())
    expect(unlockOfferCode).not.toHaveBeenCalled()
    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
  })
})
