import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretOfferCheckout.render.test.jsx — PLU ARG
 *
 * El canje del código secreto DESDE EL CHECKOUT DE INSCRIPCIÓN, y en particular
 * el caso que estaba roto: **combo restringido todavía sin destrabar**.
 *
 * Ahí `effectivePurchaseType` es 'registration' (el paquete no es accesible
 * hasta que hay código), así que el preview del código —que es de alcance
 * 'combo'— volvía con `not_applicable` y la pantalla mostraba "ese código no
 * aplica a este pago": exactamente el código que venía a destrabar el paquete.
 * Ahora se reintenta contra el combo antes de dar el error por bueno.
 *
 * También cubre que el cambio de paquete no borre el código que causó ese
 * cambio, y el auto-canje al entrar desde la ficha "Oferta exclusiva".
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

vi.mock('../src/config/env.js', () => ({
  env: {
    appUrl: 'http://localhost:5173',
    apiUrl: '',
    isDev: true,
    demoMode: false,
    appProduction: false,
    supabase: { url: '', anonKey: '', configured: false },
    mercadoPago: { publicKey: 'APP_USR-test-public-key', configured: true },
    payments: { transferAlias: 'plu.arg', transferCbu: '0', transferHolder: 'PLU ARG' },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
}))

vi.mock('../src/services/athleteApi.js', () => ({
  resendAthleteVerification: vi.fn(),
  checkAthleteAvailability: vi.fn(),
  verifyAthleteEmailCode: vi.fn(),
  verifyComboAccessCode: vi.fn(),
  previewDiscountCode: vi.fn(),
  unlockOfferCode: vi.fn(),
  fetchOfferUnlocks: vi.fn(async () => []),
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

vi.mock('../src/lib/registrationSchedule.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isPaidCheckoutOpen: () => true }
})

vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: vi.fn(),
  Payment: () => <div data-testid="payment-brick" />,
  CardPayment: () => <div data-testid="card-payment-brick" />,
  Wallet: () => <div data-testid="wallet-brick" />,
}))

vi.mock('../src/services/paymentService.js', () => ({
  createPreference: vi.fn(async () => ({})),
  getPaymentOrderStatus: vi.fn(),
  notifyMockPayment: vi.fn(),
  processEmbeddedPayment: vi.fn(),
  processEmbeddedSubscription: vi.fn(),
  reportPaymentClientEvent: vi.fn(async () => ({ accepted: true })),
}))

const RegisterPage = (await import('../src/pages/RegisterPage.jsx')).default
const { fetchRegistrationAccessRequirements } =
  await import('../src/services/registrationAccessService.js')
const { previewDiscountCode, unlockOfferCode, fetchOfferUnlocks } =
  await import('../src/services/athleteApi.js')

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  emailVerifiedAt: '2026-01-01T00:00:00Z',
}

/** Combo restringido: existe y está vigente, pero pide código. */
const RESTRICTED_EVENT = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 65000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
  pricing: { membership: 85000, registration: 65000 },
  comboOffer: {
    price: 150000,
    manualPrice: null,
    currency: 'ARS',
    active: true,
    audience: 'code',
    startsAt: null,
    endsAt: null,
  },
}

const OFFER_PAYLOAD = {
  code: 'ONLY-PITBULL',
  kind: 'offer',
  fixedPrice: 120000,
  redeemed: false,
  event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
  comboOffer: { ...RESTRICTED_EVENT.comboOffer },
}

const COMBO_PREVIEW = {
  valid: true,
  kind: 'offer',
  code: 'ONLY-PITBULL',
  discountAmount: 30000,
  finalAmount: 120000,
  manualChannels: [],
  eventSlug: 'pitbull-classic-2026',
}

const NOT_APPLICABLE = {
  valid: false,
  reason: 'not_applicable',
}

function renderCompetition(props = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={ATHLETE}
        createdOrder={null}
        event={RESTRICTED_EVENT}
        flow="competition"
        form={{
          division: 'Open',
          category: 'Raw',
          estimatedWeight: '83',
          paymentMethod: 'mercado_pago',
        }}
        memberships={[]}
        registrations={[]}
        total={65000}
        onNavigate={vi.fn()}
        onSubmit={vi.fn(async () => ({}))}
        onUpdateForm={vi.fn()}
        checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
        {...props}
      />
    </I18nProvider>,
  )
}

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** El preview automático de promo pública corre sin código. */
function isAutomatic(call) {
  return !call?.[0]?.code
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(unlockOfferCode).mockReset()
  vi.mocked(fetchOfferUnlocks).mockReset()
  vi.mocked(fetchOfferUnlocks).mockResolvedValue([])
  vi.mocked(unlockOfferCode).mockResolvedValue({ unlocked: true, offer: OFFER_PAYLOAD })
})

describe('canje del código secreto en el checkout de inscripción', () => {
  it('no delata el combo restringido antes de escribir el código', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'no_public_promo' })
    renderCompetition()
    await waitForAccessValidation()

    expect(screen.queryByText(/Este paquete es cerrado/i)).toBe(null)
    expect(screen.queryByLabelText(/Código del combo/i)).toBe(null)
    expect(screen.queryByText('$\u00a0150.000')).toBe(null)
    expect(screen.getByLabelText(/^Código$/i)).toBeTruthy()
    expect(screen.getByText(/^Canjeá tu código\.$/i)).toBeTruthy()
  })

  it('destraba un combo restringido reintentando el preview contra el combo', async () => {
    // Alcance 'registration' (el paquete todavía no es accesible) -> rechazo por
    // alcance; alcance 'combo' -> válido.
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      if (appliesTo === 'combo') return COMBO_PREVIEW
      return NOT_APPLICABLE
    })
    renderCompetition()
    await waitForAccessValidation()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'only-pitbull' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    expect(await screen.findByText('Redirigiéndote a tu pestaña secreta…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())
    // El error de alcance NO se muestra: fue un paso intermedio, no el resultado.
    expect(screen.queryByText('Ese código no aplica a este pago.')).toBe(null)
    expect(screen.getByText('ONLY-PITBULL')).toBeTruthy()

    // Se consultaron los dos alcances, en ese orden.
    const scopes = vi
      .mocked(previewDiscountCode)
      .mock.calls.filter((call) => !isAutomatic(call))
      .map((call) => call[0].appliesTo)
    expect(scopes).toEqual(['registration', 'combo'])

    // El canje quedó registrado del lado del servidor: es lo que sostiene la
    // ficha de Mi cuenta después de un refresh.
    expect(unlockOfferCode).toHaveBeenCalledWith({ code: 'ONLY-PITBULL' })
  })

  it('revela el combo desde el canje aunque el catalogo publico no lo incluya', async () => {
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      if (appliesTo === 'combo') return COMBO_PREVIEW
      return NOT_APPLICABLE
    })
    renderCompetition({ event: { ...RESTRICTED_EVENT, comboOffer: null } })
    await waitForAccessValidation()

    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'ONLY-PITBULL' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() => expect(screen.getByText(/secreto/i)).toBeTruthy())
    expect(unlockOfferCode).toHaveBeenCalledWith({ code: 'ONLY-PITBULL' })
  })

  it('el código de desbloqueo sobrevive al cambio de paquete que él mismo provoca', async () => {
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      if (appliesTo === 'combo') return COMBO_PREVIEW
      return NOT_APPLICABLE
    })
    renderCompetition()
    await waitForAccessValidation()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'ONLY-PITBULL' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())
    // Si el efecto de `purchaseType` lo hubiera limpiado, el anuncio y el
    // aplicado desaparecerían en el render siguiente.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy()
  })

  it('un código que de verdad no aplica sigue mostrando el error', async () => {
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      if (appliesTo === 'combo') {
        return { valid: false, reason: 'not_applicable' }
      }
      return {
        valid: false,
        reason: 'not_applicable',
        kind: 'fixed_price',
        appliesTo: 'membership',
      }
    })
    renderCompetition()
    await waitForAccessValidation()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'SOLO-AFILIACION' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() => expect(screen.getByText('Ese código no aplica a este pago.')).toBeTruthy())
    expect(unlockOfferCode).not.toHaveBeenCalled()
    // Aunque el primer rechazo diga que es un precio fijo, el servidor vuelve
    // a decidir contra el combo. Si tampoco aplica, recién ahí se muestra error.
    const scopes = vi
      .mocked(previewDiscountCode)
      .mock.calls.filter((call) => !isAutomatic(call))
      .map((call) => call[0].appliesTo)
    expect(scopes).toEqual(['registration', 'combo'])
  })

  it('nombra la inscripción cuando el código es de otro torneo', async () => {
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      return { valid: false, reason: 'other_event', eventTitle: 'Copa Norte' }
    })
    renderCompetition()
    await waitForAccessValidation()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'ONLY-NORTE' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() =>
      expect(screen.getByText('Ese código es de Copa Norte, no de este torneo.')).toBeTruthy(),
    )
  })

  it('auto-canje: la oferta ya desbloqueada se aplica sola al abrir el checkout', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([OFFER_PAYLOAD])
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      if (appliesTo === 'combo') return COMBO_PREVIEW
      return NOT_APPLICABLE
    })
    renderCompetition()
    await waitForAccessValidation()

    // Sin tipear nada: entrar desde la ficha no puede obligar a volver a
    // escribir el código que ya se canjeó.
    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())
    expect(screen.getByText('ONLY-PITBULL')).toBeTruthy()
  })

  it('una oferta ya comprada no se auto-aplica', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([{ ...OFFER_PAYLOAD, redeemed: true }])
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'no_public_promo' })
    renderCompetition()
    await waitForAccessValidation()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
  })

  it('una oferta de otro torneo no se auto-aplica en este checkout', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([
      { ...OFFER_PAYLOAD, event: { slug: 'copa-norte', title: 'Copa Norte' } },
    ])
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'no_public_promo' })
    renderCompetition()
    await waitForAccessValidation()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByText('Canjeaste el código secreto')).toBe(null)
  })
})
