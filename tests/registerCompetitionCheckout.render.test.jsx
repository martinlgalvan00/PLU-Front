import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Checkout de inscripción con link de pago: el atleta tiene que ver
 * transferencia, no "ya estás inscripto".
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

afterEach(() => cleanup())

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
  resendAthleteVerification: vi.fn(),
  checkAthleteAvailability: vi.fn(),
  verifyAthleteEmailCode: vi.fn(),
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
}

const event = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 75000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
}

const pendingOrder = {
  type: 'competition',
  athleteName: athlete.fullName,
  athleteDocument: athlete.documentId,
  athleteId: athlete.id,
  paymentId: '8cb43d94-b330-4e69-a2d0-76a56916ebf5',
  paymentMethod: 'manual_link',
  amount: 75000,
  concept: 'Inscripción Pitbull Classic 2026',
  reference: 'RORD-1',
  status: 'validacion_manual',
}

function renderCompetition({
  createdOrder = null,
  form = {},
  athleteData = athlete,
  onNavigate = () => {},
  onSubmit = vi.fn(async () => ({})),
  onUpdateForm = () => {},
  registrations = [],
} = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={athleteData}
        createdOrder={createdOrder}
        event={event}
        flow="competition"
        form={{
          division: 'Open',
          category: 'Raw',
          estimatedWeight: '83',
          paymentMethod: 'mercado_pago',
          ...form,
        }}
        memberships={[]}
        registrations={registrations}
        total={75000}
        onNavigate={onNavigate}
        onSubmit={onSubmit}
        onUpdateForm={onUpdateForm}
      />
    </I18nProvider>,
  )
}

describe('RegisterPage competition profile summary', () => {
  it('renders the incomplete profile as a clear summary without raw translation keys', () => {
    const onNavigate = vi.fn()
    renderCompetition({ onNavigate })

    expect(screen.getByRole('heading', { name: /perfil de competencia/i })).toBeTruthy()
    expect(screen.getByText(/datos pendientes/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /completar perfil/i })).toBeTruthy()
    expect(screen.queryByText(/pages\.register\./i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /completar perfil/i }))
    expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-personal-data' })
  })

  it('shows the completed profile and its available competition details', () => {
    renderCompetition({
      athleteData: {
        ...athlete,
        birthDate: '1999-11-03',
        sex: 'Masculino',
        gym: 'Maximal Strength Club',
        phone: '+54 9 11 2500 7894',
        country: 'Argentina',
        province: 'Buenos Aires',
        city: 'Quilmes',
      },
    })

    expect(screen.getByText(/perfil completo/i)).toBeTruthy()
    expect(screen.getByText(/tus datos están listos/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /revisar perfil/i })).toBeTruthy()
    expect(screen.getByText('Maximal Strength Club')).toBeTruthy()
  })

  it('muestra y bloquea el compromiso competitivo de una inscripción ya creada', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({
      form: { division: 'Open', category: 'Raw', estimatedWeight: '83' },
      registrations: [{
        id: 'reg-1',
        athleteId: athlete.id,
        eventSlug: event.slug,
        status: 'pendiente',
        division: 'Junior',
        category: 'Equipped',
        bodyweightKg: 74.5,
      }],
      onUpdateForm,
    })

    expect(screen.getByText(/peso declarados.*asentados/i)).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Open' }).disabled).toBe(true)
    expect(screen.getByLabelText(/peso corporal/i).disabled).toBe(true)
    expect(onUpdateForm).toHaveBeenCalledWith({ target: { name: 'estimatedWeight', value: '74.5' } })
  })
})

describe('RegisterPage — link de pago de inscripción', () => {
  it('ofrece únicamente Mercado Pago para una inscripción nueva', () => {
    renderCompetition()

    expect(screen.getByRole('radio', { name: /mercado pago/i }).checked).toBe(true)
    expect(screen.queryByRole('radio', { name: /transferencia/i })).toBeNull()
    expect(screen.queryByRole('radio', { name: /efectivo/i })).toBeNull()
    expect(screen.getByText(/mercado pago.*próximamente/i)).toBeTruthy()
  })

  it('no muestra el texto crudo de PLU08 si la inscripción ya está confirmada', async () => {
    const onSubmit = vi.fn(async () => ({
      error: 'Ya estas inscripto en este evento.',
      code: 'PLU08',
    }))
    renderCompetition({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/inscripción confirmada/i)
    })
    expect(screen.queryByText('Ya estas inscripto en este evento.')).toBeNull()
  })

  it('deriva a retomar la afiliación si ya hay un pago de afiliación en curso', async () => {
    const onNavigate = vi.fn()
    const onSubmit = vi.fn(async () => ({
      error: 'Ya existe un pago de afiliacion en curso; completalo o espera su vencimiento.',
      code: 'PLU13',
      resumeMembershipPayment: true,
    }))
    renderCompetition({ onNavigate, onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/afiliación pendiente/i)
    })
    fireEvent.click(screen.getByRole('button', { name: /retomar mi afiliación/i }))
    expect(onNavigate).toHaveBeenCalledWith('membership')
  })

  it('permite reabrir los datos de transferencia desde la orden visible', async () => {
    renderCompetition({ createdOrder: pendingOrder })

    const openers = screen.getAllByRole('button', { name: /ver datos de transferencia/i })
    fireEvent.click(openers[0])

    expect(screen.getByRole('dialog', { name: /completar tu inscripción/i })).toBeTruthy()
    expect(screen.getByText('PLU ARG')).toBeTruthy()
  })

  it('deja el brick de Mercado Pago y el total fuera del formulario', () => {
    renderCompetition({
      createdOrder: {
        ...pendingOrder,
        paymentMethod: 'mercado_pago',
        amount: 120000,
        concept: 'Afiliación + inscripción Pitbull Classic',
        reference: 'CORD-89d27562a2589e98',
        status: 'pendiente',
      },
      form: { paymentMethod: 'mercado_pago' },
    })

    expect(screen.getByRole('heading', { name: /pagá con mercado pago/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /continuar al pago/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /elegir otro medio/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /pagar por transferencia/i })).toBeNull()
    expect(document.querySelector('.register-settle-bar .plu-checkout__total')).toBeTruthy()
    expect(document.querySelector('form.athlete-form')).toBeNull()
  })

  it('no permite cambiar a un medio manual desde el brick de Mercado Pago', () => {
    renderCompetition({
      createdOrder: {
        ...pendingOrder,
        paymentMethod: 'mercado_pago',
        status: 'pendiente',
      },
      form: { paymentMethod: 'mercado_pago' },
    })

    expect(screen.queryByRole('button', { name: /elegir otro medio/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /pagar por transferencia/i })).toBeNull()
    expect(screen.getByRole('heading', { name: /pagá con mercado pago/i })).toBeTruthy()
  })
})
