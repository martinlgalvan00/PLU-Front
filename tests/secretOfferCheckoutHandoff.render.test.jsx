import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretOfferCheckoutHandoff.render.test.jsx — PLU ARG
 *
 * El traspaso entre la pestaña secreta y el checkout, con el **resolvedor
 * universal disponible** (`athlete_redeem_promotion_code`, 20260905100000).
 *
 * Por qué en un archivo aparte de `secretOfferCheckout.render.test.jsx`: ese
 * mockea `athleteApi` sin `redeemPromotionCodeRequest`, así que el resolvedor
 * explota y el checkout cae al camino del preview. Eso cubre el despliegue en
 * el que la RPC todavía no está, pero tapaba el bug real del camino nuevo: el
 * resolvedor responde `open_exclusive_offer` TAMBIÉN para un código ya
 * canjeado (`athlete_unlock_offer_code` es idempotente y devuelve
 * `unlocked: true`), así que el checkout que se abría desde la ficha rebotaba
 * de vuelta a la ficha y el atleta nunca llegaba a pagar el precio de la
 * promoción — ni, por lo tanto, a recibir afiliación e inscripción.
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
  previewDiscountCode: vi.fn(),
  unlockOfferCode: vi.fn(),
  fetchOfferUnlocks: vi.fn(async () => []),
  redeemPromotionCodeRequest: vi.fn(),
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
const { previewDiscountCode, unlockOfferCode, fetchOfferUnlocks, redeemPromotionCodeRequest } =
  await import('../src/services/athleteApi.js')

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  emailVerifiedAt: '2026-01-01T00:00:00Z',
}

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

/** Lo que responde `athlete_redeem_promotion_code` para un código de oferta. */
const RESOLVED_OFFER = {
  status: 'accepted',
  accepted: true,
  action: 'open_exclusive_offer',
  code: 'ONLY-PITBULL',
  kind: 'offer',
  appliesTo: 'combo',
  destination: { view: 'profile', tab: 'account-offer' },
  campaign: { name: 'Solo Pitbull', objective: 'exclusive_offer' },
  offer: OFFER_PAYLOAD,
}

const FORM = {
  division: 'Open',
  category: 'Raw',
  estimatedWeight: '83',
  paymentMethod: 'mercado_pago',
}

function renderCompetition(props = {}) {
  const onNavigate = props.onNavigate ?? vi.fn()
  const onSubmit = props.onSubmit ?? vi.fn(async () => ({}))
  const tree = (extra = {}) => (
    <I18nProvider>
      <RegisterPage
        athlete={ATHLETE}
        createdOrder={null}
        event={RESTRICTED_EVENT}
        flow="competition"
        form={FORM}
        memberships={[]}
        registrations={[]}
        total={65000}
        onUpdateForm={vi.fn()}
        checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
        {...props}
        {...extra}
        onNavigate={onNavigate}
        onSubmit={onSubmit}
      />
    </I18nProvider>
  )
  const result = render(tree())
  return { ...result, onNavigate, onSubmit, update: (extra) => result.rerender(tree(extra)) }
}

/** El renglon que anuncia el codigo aplicado y el importe que se va a cobrar. */
function appliedDiscount(container) {
  return container.querySelector('.register-discount__applied')?.textContent ?? ''
}

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function previewByScope() {
  return vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
    if (!code) return { valid: false, reason: 'no_public_promo' }
    if (appliesTo === 'combo') return COMBO_PREVIEW
    return { valid: false, reason: 'not_applicable' }
  })
}

/**
 * El campo de codigo nace plegado detras de "Tengo un codigo": el checkout no le
 * pone un input a quien no tiene ninguno. Se abre antes de tipear; es idempotente
 * porque el boton desaparece una vez abierto.
 */
function openDiscountField() {
  const toggle = screen.queryByRole('button', { name: /^Tengo un código$/i })
  if (toggle) fireEvent.click(toggle)
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(unlockOfferCode).mockReset()
  vi.mocked(fetchOfferUnlocks).mockReset()
  vi.mocked(redeemPromotionCodeRequest).mockReset()
  vi.mocked(fetchOfferUnlocks).mockResolvedValue([])
  vi.mocked(unlockOfferCode).mockResolvedValue({ unlocked: true, offer: OFFER_PAYLOAD })
  vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(RESOLVED_OFFER)
  sessionStorage.clear()
})

describe('checkout abierto desde la pestaña secreta', () => {
  it('aplica la oferta en vez de rebotar de vuelta a la pestaña', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([OFFER_PAYLOAD])
    previewByScope()
    const { container, onNavigate } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())
    // El precio promocional queda anunciado: es lo que se va a cobrar.
    expect(appliedDiscount(container)).toContain('ONLY-PITBULL')
    expect(appliedDiscount(container)).toContain('120.000')
    // Y sobre todo: nadie volvió a mandar al atleta a la pestaña secreta.
    expect(onNavigate.mock.calls.filter(([view]) => view === 'profile')).toEqual([])
  })

  it('no vuelve a canjear un código que ya estaba desbloqueado', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([OFFER_PAYLOAD])
    previewByScope()
    renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())

    // El auto-canje sólo cotiza el combo: ni resolvedor (que registraría un
    // evento de embudo por cada apertura del checkout) ni unlock nuevo.
    expect(redeemPromotionCodeRequest).not.toHaveBeenCalled()
    expect(unlockOfferCode).not.toHaveBeenCalled()
    const scopes = vi
      .mocked(previewDiscountCode)
      .mock.calls.filter((call) => call[0]?.code)
      .map((call) => call[0].appliesTo)
    expect(scopes).toEqual(['combo'])
  })

  it('cobra el combo con el código de la oferta y crea afiliación + inscripción', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([OFFER_PAYLOAD])
    previewByScope()
    const { onSubmit } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await waitFor(() => expect(screen.getByText('Canjeaste el código secreto')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    // `combo` es lo que crea afiliación e inscripción en la misma orden; el
    // `discountCode` es lo que la cobra al precio de la oferta y el
    // `comboAccessCode` lo que destraba el paquete del lado del servidor.
    expect(onSubmit.mock.calls[0][2]).toMatchObject({
      purchaseType: 'combo',
      discountCode: 'ONLY-PITBULL',
      comboAccessCode: 'ONLY-PITBULL',
    })
  })

  it('recotiza al cambiar de medio de pago sin salir del checkout', async () => {
    vi.mocked(fetchOfferUnlocks).mockResolvedValue([OFFER_PAYLOAD])
    previewByScope()
    const { container, onNavigate, update } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))

    // El importe depende del canal, así que cambiar de medio recotiza el
    // código. Eso no puede volver a mandar al atleta a la pestaña secreta.
    const before = vi.mocked(previewDiscountCode).mock.calls.length
    update({ form: { ...FORM, paymentMethod: 'manual_link' } })
    await waitFor(() =>
      expect(vi.mocked(previewDiscountCode).mock.calls.length).toBeGreaterThan(before),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(appliedDiscount(container)).toContain('ONLY-PITBULL')
    expect(onNavigate.mock.calls.filter(([view]) => view === 'profile')).toEqual([])
    expect(redeemPromotionCodeRequest).not.toHaveBeenCalled()
  })
})

describe('código tipeado en el checkout con el resolvedor disponible', () => {
  it('deja la oferta aplicada antes de revelar la pestaña secreta', async () => {
    previewByScope()
    const { container, onNavigate } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'only-pitbull' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    // La revelación sigue existiendo: es el momento en que el atleta confirma
    // qué desbloqueó.
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-offer' }),
    )
    // Pero el checkout ya quedó con la oferta aplicada, así que al volver no
    // hace falta tipear nada de nuevo.
    expect(appliedDiscount(container)).toContain('120.000')
    // El resolvedor ya registró el unlock: no se duplica.
    expect(unlockOfferCode).not.toHaveBeenCalled()
  })

  it('manda a la pestaña secreta cuando la oferta es de otro torneo', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue({
      ...RESOLVED_OFFER,
      code: 'ONLY-NORTE',
      offer: {
        ...OFFER_PAYLOAD,
        code: 'ONLY-NORTE',
        event: { slug: 'copa-norte', title: 'Copa Norte' },
      },
    })
    previewByScope()
    const { onNavigate } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'ONLY-NORTE' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-offer' }),
    )
    // No se aplicó nada en este checkout: la oferta no es de este torneo.
    const applied = vi
      .mocked(previewDiscountCode)
      .mock.calls.filter((call) => call[0]?.code === 'ONLY-NORTE')
    expect(applied).toEqual([])
  })
})
