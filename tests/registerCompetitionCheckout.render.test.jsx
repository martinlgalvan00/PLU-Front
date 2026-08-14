import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
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
  onNavigate = () => {},
  onSubmit = vi.fn(async () => ({})),
  onUpdateForm = () => {},
} = {}) {
  return render(
    <I18nProvider>
      <RegisterPage
        athlete={athlete}
        createdOrder={createdOrder}
        event={event}
        flow="competition"
        form={{
          division: 'Open',
          category: 'Raw',
          estimatedWeight: '83',
          paymentMethod: 'manual_link',
          ...form,
        }}
        memberships={[]}
        registrations={[]}
        total={75000}
        onNavigate={onNavigate}
        onSubmit={onSubmit}
        onUpdateForm={onUpdateForm}
      />
    </I18nProvider>,
  )
}

describe('RegisterPage — link de pago de inscripción', () => {
  it('abre el modal de transferencia al generar la orden', async () => {
    const onSubmit = vi.fn(async () => ({ createdOrder: pendingOrder, payment: pendingOrder }))
    renderCompetition({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /continuar al pago/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /completar tu inscripción/i })).toBeTruthy()
    })
    expect(screen.getByText('plu.arg')).toBeTruthy()
    expect(screen.queryByText(/ya estas inscripto/i)).toBeNull()
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
    expect(screen.getByRole('button', { name: /elegir otro medio/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /pagar por transferencia/i })).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: /elegir otro medio/i }))

    expect(screen.getByRole('button', { name: /continuar al pago/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /volver a mercado pago/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /pagá con mercado pago/i })).toBeNull()
  })
})
