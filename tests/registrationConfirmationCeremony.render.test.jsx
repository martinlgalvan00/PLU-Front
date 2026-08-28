import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * El cierre de una inscripción a meet.
 *
 * La inscripción confirmada no tenía cierre propio: el acuse vivía al pie de
 * `register-status--settle` (la lista de datos de la orden, montada en el aside
 * de desktop y en el contexto mobile) y la columna principal quedaba con la
 * barra de total y nada más. Eso dejaba el dato administrativo por encima del
 * hecho, la card detrás de un botón que nadie había visto, y la ráfaga saliendo
 * de un sello pegado al borde izquierdo del viewport.
 *
 * Estas pruebas fijan la forma nueva: la confirmación es un bloque de la
 * columna principal con el sello primero y la card real a la vista, el estado
 * de orden se apaga, y el acuse existe una sola vez para que la federación
 * festeje una sola vez.
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

// El doble tiene que exportar todo lo que RegisterPage consume: omitir una
// función no desvía el test a otra rama, revienta el render entero.
vi.mock('../src/services/athleteApi.js', () => ({
  fetchGyms: vi.fn(async () => []),
  resendAthleteVerification: vi.fn(),
  checkAthleteAvailability: vi.fn(),
  verifyAthleteEmailCode: vi.fn(),
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

const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  credentialToken: 'a4f1c0de-0000-4000-8000-000000000002',
}

const event = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  date: '2026-12-12',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  price: 75000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

const settledOrder = {
  type: 'competition',
  athleteName: athlete.fullName,
  athleteDocument: athlete.documentId,
  athleteId: athlete.id,
  paymentId: '4d1c0f2a-2f52-4c48-9d55-6d0c8c9f4a11',
  paymentMethod: 'mercado_pago',
  amount: 75000,
  concept: 'Inscripción Pitbull Classic 2026',
  reference: 'RORD-confirmada',
  status: 'confirmada',
}

const admittedRegistration = {
  id: 'reg-1',
  paymentOrderId: settledOrder.paymentId,
  event: 'Pitbull Classic 2026',
  eventSlug: 'pitbull-classic-2026',
  status: 'confirmada',
  requiresMembership: false,
}

function renderConfirmed({ registrations = [admittedRegistration], onNavigate = () => {} } = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={athlete}
        createdOrder={settledOrder}
        event={event}
        flow="competition"
        form={{
          division: 'Open',
          category: 'Raw',
          estimatedWeight: '83',
          paymentMethod: 'mercado_pago',
        }}
        memberships={[]}
        registrations={registrations}
        total={75000}
        onNavigate={onNavigate}
        onSubmit={vi.fn(async () => ({}))}
        onUpdateForm={() => {}}
      />
    </I18nProvider>,
  )
}

describe('cierre de inscripción a meet', () => {
  it('monta la confirmación en la columna principal, no en el estado de orden', () => {
    renderConfirmed()

    const confirmation = document.querySelector('.register-confirmation--competition')
    expect(confirmation).not.toBeNull()
    expect(document.querySelector('.register-main')?.contains(confirmation)).toBe(true)
    // El acuse ya no cuelga de la lista de datos de la orden.
    expect(document.querySelector('.register-status--settle')).toBeNull()
  })

  it('festeja una sola vez', () => {
    renderConfirmed()

    // El bloque se montaba dos veces (aside de desktop + contexto mobile, uno
    // apagado por `display: none`), así que había dos sellos en el árbol y dos
    // `celebrate` compitiendo por la misma ráfaga.
    expect(document.querySelectorAll('.confirmation-seal--registration')).toHaveLength(1)
  })

  it('pone el hecho antes que el dato administrativo', () => {
    renderConfirmed()

    const confirmation = document.querySelector('.register-confirmation--competition')
    const seal = confirmation.querySelector('.confirmation-seal--registration')
    const ledger = confirmation.querySelector('.register-confirmation__ledger')

    expect(seal).not.toBeNull()
    expect(ledger).not.toBeNull()
    expect(seal.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('muestra la card real a la vista, no solo el botón de descarga', () => {
    renderConfirmed()

    expect(document.querySelector('.register-confirmation__piece-frame .share-card')).not.toBeNull()
    expect(
      screen.getAllByRole('button', { name: /descargar y compartir mi card/i }).length,
    ).toBeGreaterThan(0)
  })

  it('dice en qué categoría compite y no repite fecha ni sede del intro', () => {
    renderConfirmed()

    const seal = document.querySelector('.confirmation-seal--registration')
    expect(seal.textContent).toMatch(/competís en open · raw/i)
    expect(seal.textContent).not.toMatch(/maximal strength club/i)
  })

  it('deja de pedir lo que ya está hecho en el encabezado', () => {
    renderConfirmed()

    expect(screen.getAllByText(/estás anotado/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/generá tu orden/i)).toBeNull()
  })

  it('lleva a las inscripciones del atleta y no a re-pagar', () => {
    const onNavigate = vi.fn()
    renderConfirmed({ onNavigate })

    screen.getByRole('button', { name: /ver mis inscripciones/i }).click()
    expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-events' })
    expect(screen.queryByRole('button', { name: /elegir otro medio/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /ver datos de transferencia/i })).toBeNull()
  })

  // El contraejemplo: con la orden todavía pendiente nada de esto aparece y el
  // estado de orden tiene que seguir en su lugar.
  it('no adelanta el cierre con la inscripción pendiente', () => {
    render(
      <I18nProvider>
        <RegisterPage
          athlete={athlete}
          createdOrder={{ ...settledOrder, paymentMethod: 'manual_link', status: 'pendiente' }}
          event={event}
          flow="competition"
          form={{ division: 'Open', category: 'Raw', paymentMethod: 'manual_link' }}
          memberships={[]}
          registrations={[{ ...admittedRegistration, status: 'pendiente' }]}
          total={75000}
          onNavigate={() => {}}
          onSubmit={vi.fn(async () => ({}))}
          onUpdateForm={() => {}}
        />
      </I18nProvider>,
    )

    expect(document.querySelector('.register-confirmation--competition')).toBeNull()
    expect(document.querySelector('.confirmation-seal--registration')).toBeNull()
    expect(document.querySelector('.register-status--settle')).not.toBeNull()
  })
})
