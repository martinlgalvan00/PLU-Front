import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Medios de una inscripción sola (sin combo): el servidor la valida solo contra
 * el concepto "inscripción", con las aperturas del evento aplicadas. El
 * checkout exigía además el casillero de afiliación —cerrado por defecto para
 * transferencia y efectivo— y escondía esos medios aunque el evento los abriera.
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
    payments: { transferAlias: 'plu.arg', transferCbu: '0000000000000000000000', transferHolder: 'PLU ARG' },
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
  cancelAthletePaymentOrder: vi.fn(async () => ({ cancelled: true })),
}))

vi.mock('../src/services/registrationAccessService.js', () => ({
  fetchRegistrationAccessRequirements: vi.fn(async () => ({
    membership: false,
    registration: false,
    membershipEnabled: true,
    registrationEnabled: true,
    membershipManualEnabled: false,
    registrationManualEnabled: true,
    // Matriz ya cruzada con el evento: Barbell abre transferencia y efectivo
    // para la inscripción; la afiliación sigue con los manuales cerrados.
    paymentChannels: {
      membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
      registration: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: false },
      ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: false },
    },
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

const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  sex: 'Femenino',
}

const event = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  price: 105000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

const platformAvailability = {
  checkoutEnabled: true,
  membershipEnabled: true,
  registrationEnabled: true,
  membershipManualEnabled: false,
  registrationManualEnabled: false,
  paymentChannels: {
    membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    ticket: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
  },
}

function renderCheckout() {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={athlete}
        createdOrder={null}
        event={event}
        flow="competition"
        payments={[]}
        form={{
          division: 'Open',
          category: 'Raw',
          declaredWeightClass: '75',
          estimatedWeight: '83',
          paymentMethod: 'mercado_pago',
        }}
        memberships={[]}
        registrations={[]}
        total={105000}
        onNavigate={() => {}}
        onSubmit={vi.fn(async () => ({}))}
        onUpdateForm={() => {}}
        checkoutAvailability={platformAvailability}
      />
    </I18nProvider>,
  )
}

describe('RegisterPage — medios de una inscripción sin combo', () => {
  it('ofrece transferencia y efectivo cuando el evento los abre, aunque la afiliación los tenga cerrados', async () => {
    renderCheckout()
    await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())

    expect(await screen.findByRole('radio', { name: /transferencia/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /efectivo/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /mercado pago/i })).toBeTruthy()
  })
})
