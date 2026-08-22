import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * secretOfferCheckout.render.test.jsx — PLU ARG
 *
 * El canje de un código de COMBO desde el checkout de inscripción, sin el
 * resolvedor universal disponible (el mock de athleteApi no lo trae, así que
 * el checkout cae al camino del preview). El caso central: **combo restringido
 * todavía sin destrabar**.
 *
 * Ahí `effectivePurchaseType` es 'registration' (el paquete no es accesible
 * hasta que hay código), así que el preview del código —que es de alcance
 * 'combo'— volvía con `not_applicable` y la pantalla mostraba "ese código no
 * aplica a este pago": exactamente el código que venía a destrabar el paquete.
 * Se reintenta contra el combo antes de dar el error por bueno.
 *
 * Las ofertas exclusivas por código ('offer'/'access') están retiradas
 * (20260915100000): acá no hay unlock del lado del servidor, ni banner de
 * canje, ni pestaña secreta. El código de combo vigente es un `fixed_price`
 * con alcance 'combo' que se aplica y se cobra en este mismo checkout.
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

const COMBO_PREVIEW = {
  valid: true,
  kind: 'fixed_price',
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

/**
 * El campo de codigo nace plegado detras de "Tengo un codigo": el checkout no le
 * pone un input a quien no tiene ninguno. Se abre antes de tipear; es idempotente
 * porque el boton desaparece una vez abierto.
 */
function openDiscountField() {
  const toggle = screen.queryByRole('button', { name: /^Tengo un código$/i })
  if (toggle) fireEvent.click(toggle)
}

/** El renglon que anuncia el codigo aplicado y el importe que se va a cobrar. */
function appliedDiscount(container) {
  return container.querySelector('.register-discount__applied')?.textContent ?? ''
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(unlockOfferCode).mockReset()
  vi.mocked(fetchOfferUnlocks).mockReset()
  vi.mocked(fetchOfferUnlocks).mockResolvedValue([])
})

describe('canje del código secreto en el checkout de inscripción', () => {
  it('no delata el combo restringido antes de escribir el código', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'no_public_promo' })
    renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

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
    const { container } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'only-pitbull' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    // El código queda aplicado en este mismo checkout, con el importe pactado.
    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))
    expect(appliedDiscount(container)).toContain('120.000')
    // El error de alcance NO se muestra: fue un paso intermedio, no el resultado.
    expect(screen.queryByText('Ese código no aplica a este pago.')).toBe(null)

    // Se consultaron los dos alcances, en ese orden.
    const scopes = vi
      .mocked(previewDiscountCode)
      .mock.calls.filter((call) => !isAutomatic(call))
      .map((call) => call[0].appliesTo)
    expect(scopes).toEqual(['registration', 'combo'])

    // Sin ofertas exclusivas no hay unlock que registrar: la única redención
    // ocurre dentro de la transacción que crea la orden.
    expect(unlockOfferCode).not.toHaveBeenCalled()
  })

  it('el código de combo sobrevive al cambio de paquete que él mismo provoca', async () => {
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      if (appliesTo === 'combo') return COMBO_PREVIEW
      return NOT_APPLICABLE
    })
    const { container } = renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'ONLY-PITBULL' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() => expect(appliedDiscount(container)).toContain('ONLY-PITBULL'))
    // Aplicar el código cambia `purchaseType` a 'combo'; si el efecto de
    // limpieza por cambio de paquete no lo exceptuara, el aplicado
    // desaparecería en el render siguiente.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(appliedDiscount(container)).toContain('ONLY-PITBULL')
  })

  it('un código que cierra Mercado Pago lo saca del selector y explica por qué', async () => {
    // 20260908100000: el cupón puede cerrar la pasarela para una oferta pactada
    // a un precio que sólo cierra por transferencia. Ofrecerla igual mandaba al
    // atleta contra el PLU28 de la RPC al enviar la orden.
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      return {
        valid: true,
        kind: 'fixed_price',
        code: 'PACTADO',
        discountAmount: 20000,
        finalAmount: 45000,
        manualChannels: ['bank_transfer'],
        mercadoPagoEnabled: false,
        eventSlug: 'pitbull-classic-2026',
      }
    })
    renderCompetition()
    await waitForAccessValidation()
    openDiscountField()

    fireEvent.change(await screen.findByLabelText(/^Código$/i), { target: { value: 'pactado' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Transferencia bancaria/ })).toBeTruthy(),
    )
    expect(screen.queryByRole('radio', { name: /Mercado Pago/ })).toBe(null)
    expect(screen.getByText(/Tu código no se paga con Mercado Pago/)).toBeTruthy()
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
    openDiscountField()

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
    openDiscountField()

    const input = await screen.findByLabelText(/^Código$/i)
    fireEvent.change(input, { target: { value: 'ONLY-NORTE' } })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))

    await waitFor(() =>
      expect(screen.getByText('Ese código es de Copa Norte, no de este torneo.')).toBeTruthy(),
    )
  })

  it('el checkout no consulta ofertas desbloqueadas al abrirse', async () => {
    // El auto-canje de la ficha "Oferta exclusiva" se retiró junto con las
    // ofertas por código: abrir el checkout no dispara ninguna consulta de
    // unlocks ni aplica nada solo.
    vi.mocked(previewDiscountCode).mockResolvedValue({ valid: false, reason: 'no_public_promo' })
    renderCompetition()
    await waitForAccessValidation()
    openDiscountField()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchOfferUnlocks).not.toHaveBeenCalled()
    expect(unlockOfferCode).not.toHaveBeenCalled()
  })
})
