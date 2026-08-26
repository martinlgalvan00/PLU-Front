import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * promotionRevealCheckout.render.test.jsx — PLU ARG
 *
 * El anuncio del canje en el checkout de inscripción, con el resolvedor
 * universal SÍ disponible.
 *
 * `secretOfferCheckout.render.test.jsx` cubre el mismo flujo a propósito sin
 * `redeemPromotionCodeRequest` en el mock: prueba la rama de compatibilidad, la
 * del preview solo. Acá el resolvedor contesta, así que se ejerce el camino que
 * ve un atleta real: el código de combo destraba el paquete Y el canje se
 * anuncia con lo que el paquete significa.
 *
 * Es el caso que más lo justifica: sin anuncio, al escribir el código aparecía
 * una tarjeta de combo de la nada, sin nombre de campaña, sin decir con qué se
 * puede pagar, ni por cuánto tiempo se puede delegar el pago, ni cuántos
 * lugares quedan.
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

// Mock completo, con el resolvedor incluido: omitirlo desvía el checkout a la
// rama de compatibilidad y el test mediría otra cosa.
vi.mock('../src/services/athleteApi.js', () => ({
  // El alta y la ficha personal piden el listado de gimnasios al montar
  // (RegisterPage / PersonalDataSection). Omitirlo en el doble no desvia el
  // test a otra rama: revienta el render entero con "No fetchGyms export is
  // defined on the mock".
  fetchGyms: vi.fn(async () => []),
  resendAthleteVerification: vi.fn(),
  checkAthleteAvailability: vi.fn(),
  verifyAthleteEmailCode: vi.fn(),
  verifyComboAccessCode: vi.fn(),
  previewDiscountCode: vi.fn(),
  redeemPromotionCodeRequest: vi.fn(),
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
  manualChannels: ['bank_transfer', 'cash_pitbull'],
  mercadoPagoEnabled: false,
  financed: true,
  financingTermDays: 14,
  eventSlug: 'pitbull-classic-2026',
}

const NOT_APPLICABLE = { valid: false, reason: 'not_applicable' }

/** Lo que contesta el resolvedor universal para ese mismo código. */
const RESOLVED = {
  status: 'accepted',
  accepted: true,
  action: 'apply_to_checkout',
  code: 'ONLY-PITBULL',
  kind: 'fixed_price',
  appliesTo: 'combo',
  campaign: {
    name: 'Combo Pitbull Classic',
    description: 'Afiliación anual más inscripción, al precio cerrado del combo.',
  },
  destination: { view: 'competition', eventSlug: 'pitbull-classic-2026' },
  benefit: {
    fixedPrice: 120000,
    manualChannels: ['bank_transfer', 'cash_pitbull'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 14,
    maxRedemptions: 8,
    remaining: 2,
    expiresAt: '2026-11-20T23:59:00.000Z',
  },
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

async function redeemCombo() {
  const toggle = screen.queryByRole('button', { name: /^Tengo un código$/i })
  if (toggle) fireEvent.click(toggle)
  fireEvent.change(await screen.findByLabelText(/^Código$/i), {
    target: { value: 'only-pitbull' },
  })
  fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(previewDiscountCode).mockReset()
  vi.mocked(redeemPromotionCodeRequest).mockReset()
  vi.mocked(previewDiscountCode).mockImplementation(async ({ code, appliesTo }) => {
    if (!code) return { valid: false, reason: 'no_public_promo' }
    if (appliesTo === 'combo') return COMBO_PREVIEW
    return NOT_APPLICABLE
  })
  vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(RESOLVED)
})

describe('anuncio del canje en el checkout de inscripción', () => {
  it('el código que destraba el combo anuncia lo que el combo significa', async () => {
    renderCompetition()
    await waitForAccessValidation()

    await redeemCombo()

    const dialog = await screen.findByRole('dialog')
    // Por el nombre accesible: la página tiene sus propios headings.
    expect(dialog.getAttribute('aria-labelledby')).toBe('promotion-reveal-title')
    expect(document.getElementById('promotion-reveal-title').textContent).toMatch(
      /precio promocional/i,
    )
    expect(screen.getByText('Combo Pitbull Classic')).toBeTruthy()
    expect(dialog.textContent).toContain('ONLY-PITBULL')
  })

  it('cuenta las tres condiciones que la banda del checkout no dice', async () => {
    renderCompetition()
    await waitForAccessValidation()

    await redeemCombo()
    const dialog = await screen.findByRole('dialog')

    // Pasarela cerrada: el combo sólo se cierra a mano.
    expect(dialog.textContent).toMatch(/Únicamente con transferencia · efectivo/i)
    // Pago delegable, con plazo y consecuencia.
    expect(dialog.textContent).toMatch(/14 días para acreditarlo/i)
    expect(dialog.textContent).toMatch(/se da de baja sola/i)
    // Cupo restante: es lo que hace legible una promo cerrada.
    expect(dialog.textContent).toMatch(/Quedan 2 lugares/i)
  })

  it('la acción principal no saca al atleta del checkout que va a cobrar', async () => {
    const onNavigate = vi.fn()
    renderCompetition({ onNavigate })
    await waitForAccessValidation()

    await redeemCombo()
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /Seguir con el pago/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // El destino del resolvedor es ESTE torneo, así que no se navega a ningún
    // lado: se cierra el anuncio y el paquete queda aplicado abajo.
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('el anuncio se cierra y se puede volver a abrir sin canjear de nuevo', async () => {
    const { container } = renderCompetition()
    await waitForAccessValidation()

    await redeemCombo()
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /Seguir con el pago/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // El código quedó aplicado con el importe pactado.
    await waitFor(() =>
      expect(container.querySelector('.register-discount__applied')?.textContent ?? '').toContain(
        'ONLY-PITBULL',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: /Ver el beneficio/i }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(redeemPromotionCodeRequest).toHaveBeenCalledTimes(1)
  })

  it('quitar el código retira el anuncio junto con el paquete', async () => {
    renderCompetition()
    await waitForAccessValidation()

    await redeemCombo()
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /Seguir con el pago/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /^Quitar$/i }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Ver el beneficio/i })).toBeNull(),
    )
  })

  it('un código que no aplica no anuncia nada', async () => {
    vi.mocked(previewDiscountCode).mockImplementation(async ({ code }) => {
      if (!code) return { valid: false, reason: 'no_public_promo' }
      return { valid: false, reason: 'expired' }
    })
    renderCompetition()
    await waitForAccessValidation()

    await redeemCombo()

    expect(await screen.findByText('Ese código venció.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
