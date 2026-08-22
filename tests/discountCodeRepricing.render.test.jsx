import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * discountCodeRepricing.render.test.jsx — PLU ARG
 *
 * Recotizar un cupón no es volver a canjearlo.
 *
 * El importe de un código depende del canal (transferencia y efectivo pueden
 * tener precio propio), así que cambiar de medio de pago revalida el cupón. Esa
 * revalidación pasaba por el resolvedor universal: un POST de canje —que además
 * escribe un evento de embudo y reintenta el unlock— por cada vez que alguien
 * tocaba el selector, cuando lo único que hacía falta era volver a pedir el
 * precio. El checkout de inscripción ya tenía la guarda, pero sólo para el
 * código de la oferta.
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

/**
 * El mock lista TODO lo que la pantalla consume de `athleteApi`: omitir una
 * función manda el flujo por la rama de compatibilidad (el `catch` que tolera un
 * resolvedor sin desplegar) y el test mediría otra cosa.
 */
vi.mock('../src/services/athleteApi.js', () => ({
  previewDiscountCode: vi.fn(),
  redeemPromotionCodeRequest: vi.fn(),
  unlockOfferCode: vi.fn(),
  resendAthleteVerification: vi.fn(),
  confirmAthleteManualPayment: vi.fn(),
}))

vi.mock('../src/services/registrationAccessService.js', () => ({
  fetchRegistrationAccessRequirements: vi.fn(async () => ({
    membership: false,
    registration: false,
    membershipEnabled: true,
    registrationEnabled: true,
    membershipManualEnabled: false,
    registrationManualEnabled: false,
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
        price: 42000,
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
const { previewDiscountCode, redeemPromotionCodeRequest } = await import(
  '../src/services/athleteApi.js'
)

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000001',
}

/** Un cupón de porcentaje que además destraba transferencia para quien lo use. */
const CODE_PREVIEW = {
  valid: true,
  code: 'CLUB-25',
  kind: 'percent',
  source: 'code',
  appliesTo: 'membership',
  percentOff: 25,
  discountAmount: 10500,
  finalAmount: 31500,
  manualChannels: ['bank_transfer'],
  mercadoPagoEnabled: true,
  financed: false,
}

function renderSection() {
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
      />
    </I18nProvider>,
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(redeemPromotionCodeRequest).mockReset()
  vi.mocked(redeemPromotionCodeRequest).mockResolvedValue({
    status: 'accepted',
    accepted: true,
    action: 'apply_to_checkout',
    code: 'CLUB-25',
    kind: 'percent',
    appliesTo: 'membership',
    destination: { view: 'profile', tab: 'account-membership' },
    benefit: { percentOff: 25, manualChannels: ['bank_transfer'], mercadoPagoEnabled: true },
  })
})

describe('recotización de un cupón por cambio de canal', () => {
  it('cambia de medio sin volver a canjear el código', async () => {
    // El preview del cupón; la promo pública comparte el mock y responde lo
    // mismo, así que el conteo se hace sobre el canal pedido.
    vi.mocked(previewDiscountCode).mockResolvedValue(CODE_PREVIEW)
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: /Tengo un código/i }))
    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'club-25' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() => expect(redeemPromotionCodeRequest).toHaveBeenCalledTimes(1))
    // El cupón destraba transferencia, así que el medio aparece seleccionable.
    const transfer = await screen.findByRole('radio', { name: /Transferencia bancaria/i })
    const previewsAfterApply = vi.mocked(previewDiscountCode).mock.calls.length

    fireEvent.click(transfer)

    // Se recotiza: hay un preview nuevo, con el canal nuevo.
    await waitFor(() =>
      expect(vi.mocked(previewDiscountCode).mock.calls.length).toBeGreaterThan(previewsAfterApply),
    )
    expect(
      vi
        .mocked(previewDiscountCode)
        .mock.calls.some(([args]) => args?.code === 'CLUB-25' && args?.paymentMethod !== 'mercado_pago'),
    ).toBe(true)
    // Y no se vuelve a canjear: sigue siendo un solo POST de canje.
    expect(redeemPromotionCodeRequest).toHaveBeenCalledTimes(1)
  })

  it('con un cupón aplicado no consulta la promo pública, que el cupón tapa', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue(CODE_PREVIEW)
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: /Tengo un código/i }))
    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'club-25' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
    await waitFor(() => expect(redeemPromotionCodeRequest).toHaveBeenCalledTimes(1))

    const transfer = await screen.findByRole('radio', { name: /Transferencia bancaria/i })
    vi.mocked(previewDiscountCode).mockClear()
    fireEvent.click(transfer)

    // Un solo preview por cambio de canal: el del cupón. Antes salían dos —el
    // del cupón y el de la promo pública, cuyo resultado nadie lee mientras hay
    // cupón aplicado.
    await waitFor(() => expect(previewDiscountCode).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    const withoutCode = vi
      .mocked(previewDiscountCode)
      .mock.calls.filter(([args]) => !args?.code)
    expect(withoutCode).toHaveLength(0)
  })
})
