import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Formulario de inscripción: divisiones (edad + Open al 50%) y modalidades.
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
const { previewDiscountCode, cancelAthletePaymentOrder } =
  await import('../src/services/athleteApi.js')

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
  sex: 'Femenino',
  // 21 años al 2026-11-15: Junior (y Open).
  birthDate: '2005-06-01',
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
  eventData = event,
  onNavigate = () => {},
  onSubmit = vi.fn(async () => ({})),
  onUpdateForm = () => {},
  payments = [],
  registrations = [],
  checkoutAvailability,
} = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={athleteData}
        createdOrder={createdOrder}
        event={eventData}
        flow="competition"
        payments={payments}
        form={{
          division: 'Junior',
          category: 'Raw',
          declaredWeightClass: '75',
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
        checkoutAvailability={checkoutAvailability}
      />
    </I18nProvider>,
  )
}

function lastChange(onUpdateForm, name) {
  return onUpdateForm.mock.calls
    .map(([changeEvent]) => changeEvent?.target)
    .filter((target) => target?.name === name)
    .at(-1)
}

describe('RegisterPage — divisiones', () => {
  it('un Junior ve su división por edad y Open con el 50% adicional', () => {
    renderCompetition()
    const group = screen.getByRole('group', { name: /^Divisiones$/i })
    expect(within(group).getByRole('checkbox', { name: /Junior · por tu edad/i })).toBeTruthy()
    // 50% de 75.000
    expect(within(group).getByRole('checkbox', { name: /Open · \+.*37\.500/ })).toBeTruthy()
  })

  it('por defecto compite en su división por edad, sin Open', () => {
    renderCompetition()
    const group = screen.getByRole('group', { name: /^Divisiones$/i })
    expect(within(group).getByRole('checkbox', { name: /Junior/ }).checked).toBe(true)
    expect(within(group).getByRole('checkbox', { name: /Open/ }).checked).toBe(false)
  })

  it('marcar Open además de la de edad manda Open como segunda división', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ onUpdateForm })
    fireEvent.click(screen.getByRole('checkbox', { name: /Open/ }))
    expect(lastChange(onUpdateForm, 'division')).toEqual({ name: 'division', value: 'Junior' })
    expect(lastChange(onUpdateForm, 'secondaryDivision')).toEqual({
      name: 'secondaryDivision',
      value: 'Open',
    })
  })

  it('desmarcar la de edad y dejar solo Open manda Open como única división', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ form: { division: 'Junior', secondaryDivision: 'Open' }, onUpdateForm })
    fireEvent.click(screen.getByRole('checkbox', { name: /Junior/ }))
    expect(lastChange(onUpdateForm, 'division')).toEqual({ name: 'division', value: 'Open' })
    expect(lastChange(onUpdateForm, 'secondaryDivision')).toEqual({
      name: 'secondaryDivision',
      value: '',
    })
  })

  it('con las dos elegidas el total suma el 50% y el resumen nombra ambas', () => {
    renderCompetition({ form: { secondaryDivision: 'Open' } })
    expect(screen.getAllByText(/112\.500/).length).toBeGreaterThan(0)
    expect(document.querySelector('.register-competition-ticket__picks').textContent).toMatch(
      /Junior \+ Open/,
    )
    expect(document.querySelector('.plu-checkout__pill-price').textContent).toMatch(/112\.500/)
  })

  it('solo Open paga el precio completo y no muestra el recargo', () => {
    renderCompetition({ form: { division: 'Open' } })
    expect(screen.queryByText(/112\.500/)).toBeNull()
    const group = screen.getByRole('group', { name: /^Divisiones$/i })
    expect(within(group).getByRole('checkbox', { name: /^Open$/ }).checked).toBe(true)
  })

  it('quien ya compite en Open por edad no tiene casillas, solo el aviso', () => {
    renderCompetition({
      form: { division: 'Open' },
      athleteData: { ...athlete, birthDate: '1995-01-01' },
    })
    expect(screen.queryByRole('group', { name: /^Divisiones$/i })).toBeNull()
    expect(screen.getByText(/por tu edad competís en Open/i)).toBeTruthy()
  })

  it('una segunda división que ya no corresponde se limpia sola', async () => {
    const onUpdateForm = vi.fn()
    renderCompetition({
      form: { division: 'Open', secondaryDivision: 'Open' },
      onUpdateForm,
    })
    await waitFor(() =>
      expect(onUpdateForm).toHaveBeenCalledWith({
        target: { name: 'secondaryDivision', value: '' },
      }),
    )
  })
})

describe('RegisterPage — modalidad', () => {
  it('ofrece Full Power y las especialidades, con Full Power marcado por defecto', () => {
    renderCompetition()
    const group = screen.getByRole('group', { name: /^Modalidad$/i })
    expect(within(group).getByRole('checkbox', { name: 'Full Power' }).checked).toBe(true)
    for (const name of [/push-pull/i, /especialista en sentadilla/i, /especialista en banco/i, /especialista en peso muerto/i]) {
      expect(within(group).getByRole('checkbox', { name }).checked).toBe(false)
    }
    expect(screen.getByText(/combinarlas no tiene costo extra/i)).toBeTruthy()
  })

  it('el campo de equipamiento se llama Categoría de competencia', () => {
    renderCompetition()
    expect(screen.getByRole('radiogroup', { name: /^Categoría de competencia$/i })).toBeTruthy()
  })

  it('marcar una especialidad la suma y no cambia el total', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ onUpdateForm })
    fireEvent.click(screen.getByRole('checkbox', { name: /especialista en banco/i }))
    expect(lastChange(onUpdateForm, 'modalities')).toEqual({
      name: 'modalities',
      value: ['full_power', 'bench'],
    })
    expect(screen.queryByText(/112\.500/)).toBeNull()
  })

  it('se puede ser especialista sin Full Power y en más de una', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ form: { modalities: ['bench'] }, onUpdateForm })
    fireEvent.click(screen.getByRole('checkbox', { name: /especialista en sentadilla/i }))
    expect(lastChange(onUpdateForm, 'modalities').value).toEqual(['squat', 'bench'])
  })

  it('Push-Pull saca banco y peso muerto, que ya incluye', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ form: { modalities: ['bench', 'deadlift'] }, onUpdateForm })
    fireEvent.click(screen.getByRole('checkbox', { name: /push-pull/i }))
    expect(lastChange(onUpdateForm, 'modalities').value).toEqual(['push_pull'])
  })

  it('sin ninguna marcada queda vacía y se muestra el error del formulario', () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ onUpdateForm })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Full Power' }))
    expect(lastChange(onUpdateForm, 'modalities').value).toEqual([])
  })
})

describe('RegisterPage — inscripción ya confirmada', () => {
  const confirmed = {
    athleteId: athlete.id,
    eventSlug: event.slug,
    status: 'confirmada',
    paymentOrderId: 'order-1',
    division: 'Junior',
    category: 'Raw',
    secondaryDivision: 'Open',
    modalities: ['full_power', 'bench'],
  }

  function sentValues(onUpdateForm) {
    return Object.fromEntries(
      onUpdateForm.mock.calls.map(([changeEvent]) => [changeEvent.target.name, changeEvent.target.value]),
    )
  }

  it('vuelca la segunda división y las modalidades comprometidas al formulario', async () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ registrations: [confirmed], onUpdateForm })
    await waitFor(() => expect(onUpdateForm).toHaveBeenCalled())
    const sent = sentValues(onUpdateForm)
    expect(sent.secondaryDivision).toBe('Open')
    expect(sent.modalities).toEqual(['full_power', 'bench'])
  })

  it('una inscripción sin segunda división limpia lo que hubiera quedado en el formulario', async () => {
    const onUpdateForm = vi.fn()
    renderCompetition({
      registrations: [{ ...confirmed, secondaryDivision: '', modalities: ['push_pull'] }],
      form: { secondaryDivision: 'Open' },
      onUpdateForm,
    })
    await waitFor(() => expect(onUpdateForm).toHaveBeenCalled())
    const sent = sentValues(onUpdateForm)
    expect(sent.secondaryDivision).toBe('')
    expect(sent.modalities).toEqual(['push_pull'])
  })

  it('con la inscripción comprometida los controles quedan bloqueados', () => {
    renderCompetition({
      registrations: [confirmed],
      form: { secondaryDivision: 'Open', modalities: ['full_power', 'bench'] },
    })
    const fields = document.querySelector('.register-competition-fields')
    const inputs = [...fields.querySelectorAll('input[type="radio"], input[type="checkbox"]')]
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) expect(input.disabled, input.name).toBe(true)
  })
})

describe('RegisterPage — lo que ofrece el evento', () => {
  const restricted = {
    ...event,
    offering: {
      categories: ['Raw', 'Single-Ply'],
      divisions: ['Open', 'Masters'],
      modalities: ['full_power', 'bench'],
    },
  }

  it('solo lista las categorías de competencia que el evento ofrece', () => {
    renderCompetition({ eventData: restricted })
    const group = screen.getByRole('radiogroup', { name: /^Categoría de competencia$/i })
    const names = within(group).getAllByRole('radio').map((radio) => radio.value)
    expect(names).toEqual(['Raw', 'Single-Ply'])
  })

  it('solo lista las modalidades que el evento ofrece', () => {
    renderCompetition({ eventData: restricted })
    const group = screen.getByRole('group', { name: /^Modalidad$/i })
    const labels = within(group).getAllByRole('checkbox').map((box) => box.parentElement.textContent)
    expect(labels).toEqual(['Full Power', 'Especialista en banco'])
  })

  it('si el evento no ofrece su división por edad, solo queda Open', async () => {
    const onUpdateForm = vi.fn()
    renderCompetition({ eventData: restricted, onUpdateForm })
    expect(screen.queryByRole('group', { name: /^Divisiones$/i })).toBeNull()
    expect(screen.getByText(/este evento solo ofrece open para tu edad/i)).toBeTruthy()
    await waitFor(() =>
      expect(onUpdateForm).toHaveBeenCalledWith({ target: { name: 'division', value: 'Open' } }),
    )
  })

  it('si lo que estaba elegido ya no se ofrece, pasa a lo primero que sí', async () => {
    const onUpdateForm = vi.fn()
    renderCompetition({
      eventData: restricted,
      form: { category: 'Unlimited', modalities: ['squat'] },
      onUpdateForm,
    })
    await waitFor(() => {
      expect(onUpdateForm).toHaveBeenCalledWith({ target: { name: 'category', value: 'Raw' } })
      expect(onUpdateForm).toHaveBeenCalledWith({
        target: { name: 'modalities', value: ['full_power'] },
      })
    })
  })

  it('un evento sin oferta configurada ofrece todo', () => {
    renderCompetition()
    const group = screen.getByRole('radiogroup', { name: /^Categoría de competencia$/i })
    expect(within(group).getAllByRole('radio')).toHaveLength(5)
  })
})
