import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * registerPromotionExit.render.test.jsx — PLU ARG
 *
 * Salir de la promoción tiene que ser posible: volver atrás y entrar a otro
 * pago arranca limpio.
 *
 * Dos fugas dejaban al atleta preso del código:
 *
 *   1. El pendiente de sessionStorage (el handoff ficha → checkout) sólo se
 *      limpiaba cuando el canje salía BIEN. Si fallaba —un 429, el canal
 *      equivocado— quedaba pegado y se re-canjeaba solo en CADA visita al
 *      checkout, sin ninguna forma de salir. Ahora se consume al leerlo: una
 *      oportunidad por entrega, y volver a la ficha lo entrega de nuevo.
 *
 *   2. Cambiar de torneo con el checkout montado arrastraba el código del
 *      anterior: preview, importe y canales cotizados contra el otro evento.
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
  fetchGyms: vi.fn(async () => []),
  resendAthleteVerification: vi.fn(),
  checkAthleteAvailability: vi.fn(),
  verifyAthleteEmailCode: vi.fn(),
  previewDiscountCode: vi.fn(),
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
const { fetchRegistrationAccessRequirements } = await import(
  '../src/services/registrationAccessService.js'
)
const { previewDiscountCode, redeemPromotionCodeRequest } = await import(
  '../src/services/athleteApi.js'
)

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  emailVerifiedAt: '2026-01-01T00:00:00Z',
}

const EVENT_A = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 100000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

const EVENT_B = {
  slug: 'copa-norte-2026',
  title: 'Copa Norte 2026',
  price: 90000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

const FORM = {
  division: 'Open',
  category: 'Raw',
  estimatedWeight: '83',
  paymentMethod: 'mercado_pago',
}

const PENDING_KEY = 'plu:pending-promotion-code'

function acceptedResolution(code, eventSlug) {
  return {
    status: 'accepted',
    accepted: true,
    reason: null,
    action: 'apply_discount',
    code,
    kind: 'fixed_price',
    appliesTo: 'registration',
    destination: { view: 'competition', eventSlug },
    campaign: { name: 'Pitbull exclusivo' },
    benefit: { manualChannels: [], mercadoPagoEnabled: true, remaining: 5 },
    offer: null,
    startsAt: null,
  }
}

function renderCompetition(props = {}) {
  const tree = (extra = {}) => (
    <I18nProvider>
      <RegisterPage
        athlete={ATHLETE}
        createdOrder={null}
        event={EVENT_A}
        flow="competition"
        form={FORM}
        memberships={[]}
        registrations={[]}
        total={100000}
        onNavigate={vi.fn()}
        onSubmit={vi.fn(async () => ({}))}
        onUpdateForm={vi.fn()}
        checkoutAvailability={{ membershipEnabled: true, registrationEnabled: true }}
        {...props}
        {...extra}
      />
    </I18nProvider>
  )
  const result = render(tree())
  return { ...result, update: (extra) => result.rerender(tree(extra)) }
}

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Cuántas veces se cotizó ESTE código (la promo pública viaja sin código). */
function previewCallsFor(code) {
  return vi
    .mocked(previewDiscountCode)
    .mock.calls.filter(([input]) => input?.code === code).length
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(redeemPromotionCodeRequest).mockReset()
  sessionStorage.clear()
})

describe('el pendiente del handoff se consume al leerlo', () => {
  it('un canje que falla no se re-arma solo en la próxima visita al checkout', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(
      acceptedResolution('STICKY-CODE', EVENT_A.slug),
    )
    // El canje rebota (el precio pactado no mejora el canal actual): es el
    // camino que antes dejaba el pendiente vivo en sessionStorage.
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code }) =>
      code ? { valid: false, reason: 'no_savings' } : { valid: false, reason: 'no_public_promo' },
    )
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        code: 'STICKY-CODE',
        context: {
          surface: 'bundle-gateway',
          destination: { view: 'competition', eventSlug: EVENT_A.slug },
          resolved: true,
        },
        savedAt: '2026-08-30T12:00:00.000Z',
      }),
    )

    const first = renderCompetition()
    await waitForAccessValidation()

    // El auto-canje corrió una vez, mostró su motivo y dejó la llave tipeada
    // para reintentar o corregir.
    await waitFor(() => expect(previewCallsFor('STICKY-CODE')).toBe(1))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('no mejora el precio')
    expect((await screen.findByLabelText(/^Código$/i)).value).toBe('STICKY-CODE')
    // Y el pendiente ya no existe: tuvo su oportunidad.
    expect(sessionStorage.getItem(PENDING_KEY)).toBe(null)

    // Volver atrás y entrar de nuevo al checkout: nada se canjea solo.
    first.unmount()
    renderCompetition()
    await waitForAccessValidation()

    expect(previewCallsFor('STICKY-CODE')).toBe(1)
    expect(vi.mocked(redeemPromotionCodeRequest).mock.calls.length).toBe(1)
    expect(document.querySelector('.register-discount__applied')).toBe(null)
  })
})

describe('cambiar de torneo suelta la promoción', () => {
  it('el código aplicado en un evento no aparece aplicado en el siguiente', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(
      acceptedResolution('FIX50', EVENT_A.slug),
    )
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code }) =>
      code
        ? {
            valid: true,
            code: 'FIX50',
            kind: 'fixed_price',
            appliesTo: 'registration',
            discountAmount: 15000,
            finalAmount: 85000,
            manualChannels: [],
            mercadoPagoEnabled: true,
            financed: false,
          }
        : { valid: false, reason: 'no_public_promo' },
    )

    const { container, update } = renderCompetition()
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /^Tengo un código$/i }))
    fireEvent.change(await screen.findByLabelText(/^Código$/i), { target: { value: 'FIX50' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
    await waitFor(() =>
      expect(container.querySelector('.register-discount__applied')?.textContent).toContain(
        'FIX50',
      ),
    )

    // Mismo checkout montado, otro torneo: la promoción del anterior se suelta
    // y el campo vuelve a ofrecerse vacío.
    update({ event: EVENT_B, total: 90000 })
    await waitFor(() =>
      expect(container.querySelector('.register-discount__applied')).toBe(null),
    )
    expect((await screen.findByLabelText(/^Código$/i)).value).toBe('')
    // Y no se re-cotizó solo contra el evento nuevo.
    expect(
      vi
        .mocked(previewDiscountCode)
        .mock.calls.filter(([input]) => input?.code === 'FIX50' && input?.eventSlug === EVENT_B.slug)
        .length,
    ).toBe(0)
  })
})
