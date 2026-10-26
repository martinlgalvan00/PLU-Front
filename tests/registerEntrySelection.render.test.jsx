import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * "Definí tu entrada": la clase de peso sale del peso corporal, lo que el
 * torneo fija no se pregunta y el perfil completo se pliega.
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
const { fetchRegistrationAccessRequirements } = await import('../src/services/registrationAccessService.js')

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  phone: '+54 9 11 2500 7894',
  sex: 'Femenino',
  birthDate: '2005-06-01',
  gym: 'Maximal Strength Club',
  country: 'Argentina',
  province: 'Buenos Aires',
  category: 'Raw',
  estimatedWeight: '58',
}

const event = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic 2026',
  price: 75000,
  currency: 'ARS',
  status: 'inscripcion_abierta',
  requiresMembership: false,
  startsAt: '2026-11-15T12:00:00Z',
}

/** Con estado real: los efectos que completan campos se ven en el render. */
function StatefulPage({ athleteData, eventData, initialForm, onUpdateForm, registrations = [] }) {
  const [form, setForm] = useState(initialForm)
  return (
    <RegisterPage
      athlete={athleteData}
      event={eventData}
      flow="competition"
      payments={[]}
      form={form}
      memberships={[]}
      registrations={registrations}
      total={75000}
      onNavigate={() => {}}
      onSubmit={vi.fn(async () => ({}))}
      onUpdateForm={(changeEvent) => {
        onUpdateForm?.(changeEvent)
        const { name, value } = changeEvent.target
        setForm((current) => ({ ...current, [name]: value }))
      }}
    />
  )
}

function renderEntry({ athleteData = athlete, eventData = event, form = {}, registrations = [] } = {}) {
  return render(
    <I18nProvider>
      <StatefulPage
        athleteData={athleteData}
        eventData={eventData}
        registrations={registrations}
        initialForm={{
          division: 'Junior',
          category: 'Raw',
          modalities: ['full_power'],
          estimatedWeight: '',
          declaredWeightClass: '',
          paymentMethod: 'mercado_pago',
          ...form,
        }}
      />
    </I18nProvider>,
  )
}

describe('RegisterPage — clase de peso', () => {
  it('se completa sola con la clase del peso corporal del perfil', async () => {
    renderEntry()
    const select = screen.getByRole('combobox', { name: /Categoría de peso/i })
    await waitFor(() => expect(select.value).toBe('60'))
    expect(screen.getByText(/Calculada según tu peso corporal/i)).toBeTruthy()
  })

  it('sigue al peso mientras no la elija a mano', async () => {
    renderEntry()
    const select = screen.getByRole('combobox', { name: /Categoría de peso/i })
    await waitFor(() => expect(select.value).toBe('60'))
    fireEvent.change(screen.getByRole('textbox', { name: /Peso corporal/i }), {
      target: { name: 'estimatedWeight', value: '66' },
    })
    await waitFor(() => expect(select.value).toBe('67,5'))
  })

  it('una clase elegida a mano no se pisa al cambiar el peso', async () => {
    renderEntry()
    const select = screen.getByRole('combobox', { name: /Categoría de peso/i })
    await waitFor(() => expect(select.value).toBe('60'))
    fireEvent.change(select, { target: { name: 'declaredWeightClass', value: '67,5' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Peso corporal/i }), {
      target: { name: 'estimatedWeight', value: '59' },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(select.value).toBe('67,5')
    expect(screen.getByText(/la clase sería 60 kg/i)).toBeTruthy()
  })

  it('respeta una clase previa distinta de la sugerida (orden retomada)', async () => {
    renderEntry({ form: { declaredWeightClass: '67,5' } })
    await waitForAccessValidation()
    expect(screen.getByRole('combobox', { name: /Categoría de peso/i }).value).toBe('67,5')
  })
})

describe('RegisterPage — lo que el torneo fija', () => {
  it('una sola categoría y una sola modalidad se muestran como dato, sin controles', async () => {
    renderEntry({
      eventData: {
        ...event,
        offering: { categories: ['Raw'], modalities: ['full_power'] },
      },
    })
    await waitForAccessValidation()
    expect(screen.queryByRole('radiogroup', { name: /Categoría de competencia/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /^Modalidad$/i })).toBeNull()
    expect(screen.getAllByText('Es la única que ofrece este torneo.')).toHaveLength(2)
  })

  it('con la inscripción ya asentada muestra lo que eligió, aunque el torneo acotó la oferta', async () => {
    renderEntry({
      eventData: { ...event, offering: { categories: ['Raw'] } },
      form: { category: 'Single-Ply' },
      registrations: [
        { athleteId: 'ath-1', eventSlug: 'pitbull-classic-2026', status: 'confirmada' },
      ],
    })
    await waitForAccessValidation()
    expect(screen.queryByText('Es la única que ofrece este torneo.')).toBeNull()
    expect(screen.getByText(/ya quedaron asentadas/)).toBeTruthy()
  })

  it('con varias opciones siguen siendo elegibles', async () => {
    renderEntry()
    await waitForAccessValidation()
    expect(screen.getByRole('group', { name: /^Modalidad$/i })).toBeTruthy()
  })
})

describe('RegisterPage — perfil de competencia', () => {
  it('completo: los datos quedan plegados detrás de un resumen', async () => {
    const { container } = renderEntry()
    await waitForAccessValidation()
    const disclosure = container.querySelector('.register-profile-readiness__disclosure')
    expect(disclosure.open).toBe(false)
    expect(within(disclosure).getByText(/Ana Torres · 21 años · Femenino/)).toBeTruthy()
  })

  it('incompleto: dice qué falta y deja los datos a la vista', async () => {
    const { container } = renderEntry({ athleteData: { ...athlete, gym: '', phone: '' } })
    await waitForAccessValidation()
    expect(screen.getByText(/^Falta: .*Teléfono/i)).toBeTruthy()
    expect(container.querySelector('.register-profile-readiness__disclosure').open).toBe(true)
  })
})

describe('RegisterPage — resumen de la elección', () => {
  it('la línea mobile incluye divisiones, categoría, modalidades y clase', async () => {
    const { container } = renderEntry({
      form: { secondaryDivision: 'Open', modalities: ['full_power', 'bench'] },
    })
    await waitFor(() =>
      expect(container.querySelector('.register-competition-picks-mobile').textContent).toBe(
        'Junior + Open · Raw · Full Power + Especialista en banco · 60 kg · 58 kg corporal',
      ),
    )
  })
})
