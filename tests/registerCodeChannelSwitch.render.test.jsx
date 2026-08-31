import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * registerCodeChannelSwitch.render.test.jsx — PLU ARG
 *
 * El medio elegido tiene que sobrevivir al canje o saltar solo.
 *
 * El caso real: el atleta quedó parado en transferencia (sin querer, o porque
 * venía de otro código) y canjea un precio pactado sólo para Mercado Pago.
 * Antes, el preview cotizaba contra el canal muerto y el código rebotaba con
 * un error de medio de pago; la matriz de canales del canje (benefit,
 * 20260912100000) ya decía con qué se paga. Ahora la selección salta sola al
 * primer canal que el código admite y el preview cotiza con ese.
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
    payments: {
      transferAlias: 'plu.arg',
      transferCbu: '0000000000000000000000',
      transferHolder: 'PLU ARG',
    },
    auth0: { domain: '', clientId: '', audience: '', redirectUri: '', configured: false },
  },
}))

vi.mock('../src/services/athleteApi.js', () => ({
  fetchGyms: vi.fn(async () => []),
  resendAthleteVerification: vi.fn(),
  checkAthleteAvailability: vi.fn(),
  verifyAthleteEmailCode: vi.fn(),
  previewDiscountCode: vi.fn(),
  // El resolvedor universal de códigos: acá SÍ está mockeado (a diferencia de
  // los tests que cubren el camino degradado sin resolvedor), porque la matriz
  // de canales que dispara el salto viaja en su respuesta.
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

const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
}

const event = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 100000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

/** Canje aceptado que se queda en este checkout, con su matriz de canales. */
function acceptedResolution(code, { manualChannels, mercadoPagoEnabled }) {
  return {
    status: 'accepted',
    accepted: true,
    reason: null,
    action: 'apply_discount',
    code,
    kind: 'fixed_price',
    appliesTo: 'registration',
    destination: { view: 'competition', eventSlug: event.slug },
    campaign: { name: 'Pitbull exclusivo' },
    benefit: { manualChannels, mercadoPagoEnabled, remaining: 5 },
    offer: null,
    startsAt: null,
  }
}

function validPreview(code, { manualChannels, mercadoPagoEnabled }) {
  return {
    valid: true,
    code,
    kind: 'fixed_price',
    appliesTo: 'registration',
    discountAmount: 15000,
    finalAmount: 85000,
    manualChannels,
    mercadoPagoEnabled,
    financed: false,
  }
}

let lastForm = null

function Harness({ initialMethod }) {
  const [form, setForm] = useState({
    division: 'Open',
    category: 'Raw',
    estimatedWeight: '83',
    paymentMethod: initialMethod,
  })
  lastForm = form
  return (
    <I18nProvider>
      <RegisterPage
        athlete={athlete}
        createdOrder={null}
        event={event}
        flow="competition"
        form={form}
        memberships={[]}
        payments={[]}
        registrations={[]}
        total={100000}
        onNavigate={() => {}}
        onSubmit={vi.fn(async () => ({}))}
        onUpdateForm={(changeEvent) => {
          setForm((current) => ({
            ...current,
            [changeEvent.target.name]: changeEvent.target.value,
          }))
        }}
      />
    </I18nProvider>
  )
}

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function redeemCode(code) {
  fireEvent.click(screen.getByRole('button', { name: /^Tengo un código$/i }))
  fireEvent.change(await screen.findByLabelText(/^Código$/i), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
}

describe('RegisterPage — el canje elige un medio que el código admite', () => {
  it('un código sólo Mercado Pago canjeado con transferencia elegida salta a la pasarela', async () => {
    const channels = { manualChannels: [], mercadoPagoEnabled: true }
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(
      acceptedResolution('ONLY-PITBULL-MP2026', channels),
    )
    vi.mocked(previewDiscountCode).mockResolvedValue(validPreview('ONLY-PITBULL-MP2026', channels))

    render(<Harness initialMethod="mercado_pago" />)
    await waitForAccessValidation()

    // El punto de partida del bug: transferencia elegida a mano.
    fireEvent.click(screen.getByRole('radio', { name: /transferencia/i }))
    expect(lastForm.paymentMethod).toBe('manual_link')

    await redeemCode('only-pitbull-mp2026')

    // La cotización sale con el canal del código, no con el muerto.
    await waitFor(() =>
      expect(previewDiscountCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ONLY-PITBULL-MP2026',
          paymentMethod: 'mercado_pago',
        }),
      ),
    )
    expect(previewDiscountCode).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ONLY-PITBULL-MP2026', paymentMethod: 'manual_link' }),
    )

    // La selección saltó, el código quedó aplicado (banda + anuncio del canje)
    // y transferencia ya no se ofrece: el código no la admite.
    await waitFor(() => expect(lastForm.paymentMethod).toBe('mercado_pago'))
    expect((await screen.findAllByText('ONLY-PITBULL-MP2026')).length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(screen.queryByRole('radio', { name: /transferencia/i })).toBeNull(),
    )
  })

  it('un código sólo manual canjeado con Mercado Pago elegido salta a transferencia', async () => {
    const channels = {
      manualChannels: ['bank_transfer', 'cash_pitbull'],
      mercadoPagoEnabled: false,
    }
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(
      acceptedResolution('ONLY-PITBULL-EFC2026', channels),
    )
    vi.mocked(previewDiscountCode).mockResolvedValue(validPreview('ONLY-PITBULL-EFC2026', channels))

    render(<Harness initialMethod="mercado_pago" />)
    await waitForAccessValidation()

    await redeemCode('ONLY-PITBULL-EFC2026')

    await waitFor(() =>
      expect(previewDiscountCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ONLY-PITBULL-EFC2026',
          paymentMethod: 'manual_link',
        }),
      ),
    )
    await waitFor(() => expect(lastForm.paymentMethod).toBe('manual_link'))
    // El código cerró la pasarela: no puede quedar ofrecida contra un 409.
    await waitFor(() => expect(screen.queryByRole('radio', { name: /mercado pago/i })).toBeNull())
    expect(screen.getByRole('radio', { name: /transferencia/i }).checked).toBe(true)
  })

  it('el medio elegido no se toca cuando el código ya lo admite', async () => {
    const channels = { manualChannels: ['bank_transfer'], mercadoPagoEnabled: true }
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(
      acceptedResolution('FIX50', channels),
    )
    vi.mocked(previewDiscountCode).mockResolvedValue(validPreview('FIX50', channels))

    render(<Harness initialMethod="mercado_pago" />)
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('radio', { name: /transferencia/i }))
    await redeemCode('FIX50')

    await waitFor(() =>
      expect(previewDiscountCode).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'FIX50', paymentMethod: 'manual_link' }),
      ),
    )
    await waitFor(() => expect(lastForm.paymentMethod).toBe('manual_link'))
  })

  it('ante un 429 el código tipeado no se pierde y el motivo se lee', async () => {
    const limiterMessage = 'Demasiados intentos con códigos. Proba de nuevo en unos minutos.'
    vi.mocked(redeemPromotionCodeRequest).mockRejectedValue(new Error(limiterMessage))
    vi.mocked(previewDiscountCode).mockRejectedValue(new Error(limiterMessage))

    render(<Harness initialMethod="mercado_pago" />)
    await waitForAccessValidation()

    await redeemCode('ONLY-PITBULL-MP2026')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Demasiados intentos')
    // El atleta puede reintentar sin volver a tipear: el campo conserva la llave.
    expect(screen.getByLabelText(/^Código$/i).value).toBe('ONLY-PITBULL-MP2026')
    // Y la selección no se movió: sin canje aceptado no hay matriz que obedecer.
    expect(lastForm.paymentMethod).toBe('mercado_pago')
  })
})
