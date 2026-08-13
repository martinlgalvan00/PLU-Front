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
  onNavigate = () => {},
  onSubmit = vi.fn(async () => ({})),
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
        }}
        memberships={[]}
        registrations={[]}
        total={75000}
        onNavigate={onNavigate}
        onSubmit={onSubmit}
        onUpdateForm={() => {}}
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
})
