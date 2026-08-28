import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretOfferCheckoutHandoff.render.test.jsx — PLU ARG
 *
 * El código de COMBO tipeado en el checkout de inscripción, con el
 * **resolvedor universal disponible** (`athlete_redeem_promotion_code`,
 * 20260905100000).
 *
 * Por qué en un archivo aparte de `secretOfferCheckout.render.test.jsx`: ese
 * mockea `athleteApi` sin `redeemPromotionCodeRequest`, así que el resolvedor
 * explota y el checkout cae al camino del preview. Acá el resolvedor responde,
 * y lo que se fija es que el código de combo (`fixed_price` con alcance
 * 'combo') se aplica, se cobra y se recotiza en ESTE checkout, sin navegar a
 * ninguna otra pantalla. El segundo bloque cubre la defensa contra un backend
 * sin migrar que todavía conteste `open_exclusive_offer`: las ofertas por
 * código están retiradas (20260915100000) y el cliente las rechaza antes de
 * que el checkout las vea.
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
  // El alta y la ficha personal piden el listado de gimnasios al montar
  // (RegisterPage / PersonalDataSection). Omitirlo en el doble no desvia el
  // test a otra rama: revienta el render entero con "No fetchGyms export is
  // defined on the mock".
  fetchGyms: vi.fn(async () => []),
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
  kind: 'fixed_price',
  code: 'ONLY-PITBULL',
  discountAmount: 30000,
  finalAmount: 120000,
  manualChannels: [],
  eventSlug: 'pitbull-classic-2026',
}

/** Lo que responde `athlete_redeem_promotion_code` para un código de combo. */
const RESOLVED_COMBO = {
  status: 'accepted',
  accepted: true,
  action: 'apply_to_checkout',
  code: 'ONLY-PITBULL',
  kind: 'fixed_price',
  appliesTo: 'combo',
  destination: { view: 'competition', eventSlug: 'pitbull-classic-2026' },
  campaign: { name: 'Solo Pitbull', objective: 'discount' },
  benefit: { fixedPrice: 120000, manualChannels: [], mercadoPagoEnabled: true },
}

/** Un backend sin migrar todavía puede contestar con la oferta retirada. */
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
  vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(RESOLVED_COMBO)
  sessionStorage.clear()
})

/** Tipea el código y lo canjea, como lo hace el atleta. */
async function typeAndRedeem(code) {
  fireEvent.change(await screen.findByLabelText(/^Código$/i), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
}

describe('código de combo tipeado en el checkout', () => {
  it('se aplica en este checkout sin navegar a ninguna otra pantalla', async () => {
    previewByScope()
    const { container, onNavigate } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await typeAndRedeem('only-pitbull')

    // El precio promocional queda anunciado: es lo que se va a cobrar.
    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))
    expect(appliedDiscount(container)).toContain('120.000')
    // El destino del resolvedor es este mismo torneo: no hay navegación.
    expect(onNavigate.mock.calls).toEqual([])
    // Sin ofertas exclusivas no hay unlock que registrar.
    expect(unlockOfferCode).not.toHaveBeenCalled()
  })

  it('cobra el combo con el código y crea afiliación + inscripción', async () => {
    previewByScope()
    const { onSubmit, container } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await typeAndRedeem('ONLY-PITBULL')
    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    // `combo` es lo que crea afiliación e inscripción en la misma orden; el
    // `discountCode` es lo que la cobra al precio pactado y el
    // `comboAccessCode` lo que destraba el paquete del lado del servidor.
    expect(onSubmit.mock.calls[0][2]).toMatchObject({
      purchaseType: 'combo',
      discountCode: 'ONLY-PITBULL',
      comboAccessCode: 'ONLY-PITBULL',
    })
  })

  it('recotiza al cambiar de medio de pago sin salir del checkout', async () => {
    previewByScope()
    const { container, onNavigate, update } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await typeAndRedeem('ONLY-PITBULL')
    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))

    // El importe depende del canal, así que cambiar de medio recotiza el
    // código — sólo el preview: el resolvedor ya hizo su trabajo y repetirlo
    // sería otro evento de embudo por cada cambio de medio.
    const resolverCalls = vi.mocked(redeemPromotionCodeRequest).mock.calls.length
    const before = vi.mocked(previewDiscountCode).mock.calls.length
    update({ form: { ...FORM, paymentMethod: 'manual_link' } })
    await waitFor(() =>
      expect(vi.mocked(previewDiscountCode).mock.calls.length).toBeGreaterThan(before),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(appliedDiscount(container)).toContain('ONLY-PITBULL')
    expect(onNavigate.mock.calls).toEqual([])
    expect(vi.mocked(redeemPromotionCodeRequest).mock.calls.length).toBe(resolverCalls)
  })

  // El evento real no trae `comboOffer`: `event_combo_offers` está archivada
  // desde 20260914100000 y el paquete vive sólo en el código. Los tres tests
  // de arriba corren sobre un evento con `comboOffer` ya cargado -como si esa
  // tabla siguiera viva-, así que no hubieran detectado esto: sin `comboOffer`
  // en el evento, la tarjeta del combo nunca se ofrecía aunque el código se
  // aplicara bien y el banner de descuento mostrara el importe correcto — el
  // atleta veía el torneo suelto, sin nada para llevarse el paquete.
  it('revela la tarjeta del combo con el precio pactado aunque el evento no tenga un combo cargado', async () => {
    previewByScope()
    const { container } = renderCompetition({ event: { ...RESTRICTED_EVENT, comboOffer: null } })
    await waitForAccessValidation()
    openDiscountField()
    await typeAndRedeem('ONLY-PITBULL')
    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))

    const comboRadio = screen.getByRole('radio', { name: /Afiliación \+ inscripción al torneo/i })
    expect(comboRadio.disabled).toBe(false)
    // La tarjeta del combo, no el banner de código aplicado (que ya
    // funcionaba): con ahorro real muestra "$ 120.000 en lugar de $ 150.000",
    // el mismo ahorro que antes sólo se veía cuando el evento ya traía un
    // `comboOffer` cargado.
    expect(comboRadio.closest('.plu-checkout__offer')?.textContent).toContain('120.000')
    expect(comboRadio.closest('.plu-checkout__offer')?.textContent).toContain('en lugar de')
  })
})

describe('código tipeado en el checkout con el resolvedor disponible', () => {
  // Las ofertas exclusivas generadas por código quedaron retiradas
  // (20260915100000): aunque el resolvedor universal todavía conteste
  // `open_exclusive_offer` -un backend sin migrar-, `redeemPromotionCode` lo
  // rechaza antes de que el checkout lo vea. Ni se revela nada, ni se navega
  // a ninguna pestaña secreta: el código sigue el camino normal de un cupón
  // y, al estar desactivado, termina en el error de siempre.
  it('nunca revela ni navega a la pestaña secreta: el código retirado sigue el camino normal', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(RESOLVED_OFFER)
    // Un código 'offer' desactivado (20260915100000) ya no cotiza en ningún
    // alcance: `athlete_preview_discount_code` lo rechaza por `inactive` sea
    // cual sea el `appliesTo`, así que ni el alcance normal ni el reintento
    // por combo pueden dar con un preview válido.
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'inactive' })
    const { onNavigate } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'only-pitbull' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() => expect(previewDiscountCode).toHaveBeenCalled())
    expect(onNavigate.mock.calls.filter(([view]) => view === 'profile')).toEqual([])
    expect(unlockOfferCode).not.toHaveBeenCalled()
  })

  it('una oferta de otro torneo tampoco navega ni se aplica', async () => {
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

    await waitFor(() => expect(previewDiscountCode).toHaveBeenCalled())
    expect(onNavigate.mock.calls.filter(([view]) => view === 'profile')).toEqual([])
  })
})

/**
 * El contrato vivo del código de combo: desde 20260926100000 el resolvedor NO
 * lo aplica en el checkout del torneo — devuelve `open_bundle` y lo manda a su
 * ficha en Mi cuenta, donde el paquete se lee entero y se termina de pagar.
 *
 * Los bloques de arriba siguen valiendo para el otro lado del despliegue: un
 * backend todavía sin esta migración contesta `apply_to_checkout` y el checkout
 * tiene que saber cobrarlo ahí mismo.
 */
const RESOLVED_BUNDLE = {
  status: 'accepted',
  accepted: true,
  action: 'open_bundle',
  code: 'ONLY-PITBULL',
  kind: 'fixed_price',
  appliesTo: 'combo',
  destination: {
    view: 'profile',
    tab: 'account-offer',
    eventSlug: 'pitbull-classic-2026',
  },
  campaign: { name: 'Solo Pitbull', objective: 'exclusive_offer' },
  benefit: {
    fixedPrice: 120000,
    manualChannels: ['bank_transfer'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 14,
  },
}

describe('código de combo con el contrato vivo (open_bundle)', () => {
  it('manda a la ficha del paquete en vez de aplicarse en el torneo', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(RESOLVED_BUNDLE)
    previewByScope()
    const { onNavigate } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await typeAndRedeem('only-pitbull')

    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-offer' }),
    )
    // El paquete no se cotiza acá: su alcance es el combo y su precio es el
    // pactado en el código, que la ficha lee del payload del canje.
    expect(vi.mocked(previewDiscountCode).mock.calls.map(([input]) => input?.code)).not.toContain(
      'ONLY-PITBULL',
    )
  })

  it('deja el código guardado para que la ficha lo encuentre aplicado', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(RESOLVED_BUNDLE)
    previewByScope()
    renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await typeAndRedeem('ONLY-PITBULL')

    await waitFor(() => expect(sessionStorage.getItem('plu:pending-promotion-code')).toBeTruthy())
    const pending = JSON.parse(sessionStorage.getItem('plu:pending-promotion-code'))
    expect(pending.code).toBe('ONLY-PITBULL')
    expect(pending.context.destination.tab).toBe('account-offer')
  })
})
