import { useState } from 'react'
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
const { previewDiscountCode } = await import('../src/services/athleteApi.js')

async function waitForAccessValidation() {
  await waitFor(() => expect(fetchRegistrationAccessRequirements).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

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
  checkoutAvailability,
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
        checkoutAvailability={checkoutAvailability}
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
        status: 'confirmada',
        division: 'Junior',
        category: 'Equipped',
        bodyweightKg: 74.5,
      }],
      onUpdateForm,
    })

    expect(screen.getByText(/modalidad y categoría declaradas.*asentadas/i)).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Open' }).disabled).toBe(true)
    expect(screen.getByLabelText(/^categoría$/i).disabled).toBe(true)
    expect(onUpdateForm).toHaveBeenCalledWith({ target: { name: 'estimatedWeight', value: '74.5' } })
  })

  it('mantiene editables los datos de un intento pendiente de pago', () => {
    renderCompetition({
      registrations: [{
        id: 'reg-pending',
        athleteId: athlete.id,
        eventSlug: event.slug,
        status: 'pendiente_pago',
        division: 'Junior',
        category: 'Equipped',
        bodyweightKg: 74.5,
      }],
    })

    expect(screen.getByRole('radio', { name: 'Open' }).disabled).toBe(false)
    expect(screen.getByLabelText(/^categoría$/i).disabled).toBe(false)
    const weightInput = document.querySelector('input[name="estimatedWeight"]')
    expect(weightInput).toBeTruthy()
    expect(weightInput.disabled).toBe(false)
  })
})

describe('RegisterPage — link de pago de inscripción', () => {
  it('abre el modal de transferencia al generar la orden', async () => {
    const onSubmit = vi.fn(async () => ({ createdOrder: pendingOrder, payment: pendingOrder }))

    function Harness() {
      const [createdOrder, setCreatedOrder] = useState(null)
      const [form, setForm] = useState({
        division: 'Open',
        category: 'Raw',
        estimatedWeight: '83',
        paymentMethod: 'mercado_pago',
      })
      return (
        <I18nProvider>
          <RegisterPage
            athlete={athlete}
            createdOrder={createdOrder}
            event={event}
            flow="competition"
            form={form}
            memberships={[]}
            registrations={[]}
            total={75000}
            onNavigate={() => {}}
            onSubmit={async (...args) => {
              const result = await onSubmit(...args)
              if (result?.createdOrder) setCreatedOrder(result.createdOrder)
              return result
            }}
            onUpdateForm={(event) => {
              setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
            }}
          />
        </I18nProvider>
      )
    }

    render(<Harness />)
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /completar tu inscripción/i })).toBeTruthy()
    })
    expect(screen.getByText('plu.arg')).toBeTruthy()
    expect(screen.queryByText(/ya estas inscripto/i)).toBeNull()
  })

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
    await waitForAccessValidation()

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
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/afiliación pendiente/i)
    })
    fireEvent.click(screen.getByRole('button', { name: /retomar mi afiliación/i }))
    expect(onNavigate).toHaveBeenCalledWith('membership')
  })

  it('bloquea el formulario si admin deshabilito la inscripcion al torneo', () => {
    renderCompetition({
      checkoutAvailability: {
        membershipEnabled: true,
        registrationEnabled: false,
      },
    })

    expect(screen.queryByRole('button', { name: /continuar al pago/i })).toBeNull()
    expect(screen.getByText(/inscripciones cerradas/i)).toBeTruthy()
    expect(screen.getByText(/inscripción a torneos próximamente/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /volver a eventos/i })).toBeTruthy()
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

  it('permite volver a elegir transferencia desde el brick de Mercado Pago', async () => {
    const onSubmit = vi.fn(async () => ({
      createdOrder: pendingOrder,
      payment: pendingOrder,
    }))

    function Harness() {
      const [createdOrder, setCreatedOrder] = useState({
        ...pendingOrder,
        paymentMethod: 'mercado_pago',
        status: 'pendiente',
      })
      const [form, setForm] = useState({
        division: 'Open',
        category: 'Raw',
        estimatedWeight: '83',
        paymentMethod: 'mercado_pago',
      })
      return (
        <I18nProvider>
          <RegisterPage
            athlete={athlete}
            createdOrder={createdOrder}
            event={event}
            flow="competition"
            form={form}
            memberships={[]}
            registrations={[]}
            total={75000}
            onNavigate={() => {}}
            onSubmit={async (...args) => {
              const result = await onSubmit(...args)
              if (result?.createdOrder) setCreatedOrder(result.createdOrder)
              return result
            }}
            onUpdateForm={(event) => {
              setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
            }}
          />
        </I18nProvider>
      )
    }

    render(<Harness />)
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /pagar por transferencia/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
    expect(onSubmit.mock.calls[0][2]).toMatchObject({ paymentMethod: 'manual_link' })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /completar tu inscripción/i })).toBeTruthy()
    })
  })

  it('vuelve al formulario de medio de pago sin perder la orden', () => {
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
  it('permite volver desde transferencia para elegir Mercado Pago', async () => {
    const mercadoPagoOrder = {
      ...pendingOrder,
      paymentMethod: 'mercado_pago',
      manualPaymentChannel: null,
      status: 'pendiente',
    }
    const onSubmit = vi.fn(async () => ({
      createdOrder: mercadoPagoOrder,
      payment: mercadoPagoOrder,
    }))
    function Harness() {
      const [createdOrder, setCreatedOrder] = useState(pendingOrder)
      const [form, setForm] = useState({
        division: 'Open',
        category: 'Raw',
        estimatedWeight: '83',
        paymentMethod: 'manual_link',
      })
      return (
        <I18nProvider>
          <RegisterPage
            athlete={athlete}
            createdOrder={createdOrder}
            event={event}
            flow="competition"
            form={form}
            memberships={[]}
            registrations={[]}
            total={75000}
            onNavigate={() => {}}
            onSubmit={async (...args) => {
              const result = await onSubmit(...args)
              if (result?.createdOrder) setCreatedOrder(result.createdOrder)
              return result
            }}
            onUpdateForm={(event) => {
              setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
            }}
          />
        </I18nProvider>
      )
    }

    render(<Harness />)
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /elegir otro medio/i }))

    expect(screen.getByRole('button', { name: /volver a transferencia/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /mercado pago/i }).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][2]).toMatchObject({ paymentMethod: 'mercado_pago' })
  })

  /**
   * Cancelar un pago (o simplemente ir a explorar otro medio) no puede dejar
   * el cupón aplicado sin forma de tocarlo: antes, la pantalla de "cambiar
   * método de pago" sólo mostraba el selector de medios con precios de
   * catálogo — sin la banda del código ni el campo para cargar uno nuevo.
   */
  it('conserva el cupón aplicado al volver a elegir método de pago', async () => {
    vi.mocked(previewDiscountCode).mockResolvedValue({
      valid: true,
      code: 'FIX50',
      kind: 'fixed_price',
      appliesTo: 'registration',
      discountAmount: 25000,
      finalAmount: 50000,
      manualChannels: ['bank_transfer'],
      mercadoPagoEnabled: true,
      financed: false,
    })
    const manualOrder = { ...pendingOrder, paymentMethod: 'manual_link', status: 'pendiente' }
    const onSubmit = vi.fn(async () => ({ createdOrder: manualOrder, payment: manualOrder }))

    function Harness() {
      const [createdOrder, setCreatedOrder] = useState(null)
      const [form, setForm] = useState({
        division: 'Open',
        category: 'Raw',
        estimatedWeight: '83',
        paymentMethod: 'manual_link',
      })
      return (
        <I18nProvider>
          <RegisterPage
            athlete={athlete}
            createdOrder={createdOrder}
            event={event}
            flow="competition"
            form={form}
            memberships={[]}
            registrations={[]}
            total={75000}
            onNavigate={() => {}}
            onSubmit={async (...args) => {
              const result = await onSubmit(...args)
              if (result?.createdOrder) setCreatedOrder(result.createdOrder)
              return result
            }}
            onUpdateForm={(event) => {
              setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
            }}
          />
        </I18nProvider>
      )
    }

    render(<Harness />)
    await waitForAccessValidation()

    fireEvent.click(screen.getByRole('button', { name: /^Tengo un código$/i }))
    fireEvent.change(await screen.findByLabelText(/^Código$/i), {
      target: { value: 'fix50' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Canjear$/i }))
    await waitFor(() => expect(previewDiscountCode).toHaveBeenCalled())
    expect(await screen.findByText('FIX50')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][2]).toMatchObject({ discountCode: 'FIX50' })

    // La orden por transferencia quedó creada con el cupón aplicado: cambiar
    // de medio no puede perder ni el código ni la forma de tocarlo.
    fireEvent.click(await screen.findByRole('button', { name: /elegir otro medio/i }))

    expect(screen.getByRole('button', { name: /volver a transferencia/i })).toBeTruthy()
    expect(await screen.findByText('FIX50')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Quitar$/i })).toBeTruthy()
  })
})

/**
 * Inscripción ya admitida: la orden está liquidada.
 *
 * "Settling" es el rato en que la orden todavía se está cobrando. Con la
 * inscripción admitida eso terminó, pero la pantalla seguía montando el brick
 * embebido de Mercado Pago —con su botón de pagar— y las dos acciones de medio
 * de pago, justo al lado del acuse que anunciaba que el lugar estaba
 * confirmado. Además `--settling-mp` oculta el contexto mobile para dejarle la
 * pantalla al brick, así que en teléfono el atleta no veía ni el festejo ni el
 * botón de su card.
 */
describe('RegisterPage — inscripción admitida', () => {
  const settledOrder = {
    ...pendingOrder,
    paymentMethod: 'mercado_pago',
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

  function renderSettled() {
    return renderCompetition({
      createdOrder: settledOrder,
      registrations: [admittedRegistration],
    })
  }

  it('muestra el acuse de inscripción confirmada y la acción de la card', () => {
    renderSettled()

    expect(screen.getAllByText(/tu lugar está confirmado/i).length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('button', { name: /descargar y compartir mi card/i }).length,
    ).toBeGreaterThan(0)
  })

  // La regresión concreta: `--settling-mp` apagaba el contexto mobile, que es el
  // único lugar donde el acuse vive en teléfono.
  it('no marca la pantalla como settling de Mercado Pago', () => {
    renderSettled()

    const page = document.querySelector('.register-page')
    expect(page.classList.contains('register-page--settling-mp')).toBe(false)
  })

  it('no ofrece pagar ni cambiar de medio sobre una orden ya paga', () => {
    renderSettled()

    expect(document.querySelector('.mp-embedded-checkout')).toBeNull()
    expect(document.querySelector('.register-settle__toolbar')).toBeNull()
    expect(screen.queryByRole('button', { name: /elegir otro medio/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /ver datos de transferencia/i })).toBeNull()
  })

  // El contraejemplo: con la orden todavía pendiente el brick y las acciones de
  // medio de pago tienen que seguir ahí. Sin esta prueba el arreglo podría
  // apagar el checkout entero.
  it('conserva el brick y las acciones mientras la orden sigue pendiente', () => {
    renderCompetition({
      createdOrder: { ...settledOrder, status: 'pendiente_pago' },
      registrations: [{ ...admittedRegistration, status: 'pendiente_pago' }],
    })

    const page = document.querySelector('.register-page')
    expect(page.classList.contains('register-page--settling-mp')).toBe(true)
    expect(document.querySelector('.register-settle__toolbar')).not.toBeNull()
  })
})
