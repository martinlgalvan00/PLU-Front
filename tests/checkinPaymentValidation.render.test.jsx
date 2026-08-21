import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Cobro en la puerta. Hasta ahora la sección Check-in del panel no se
 * renderizaba (AdminPage devolvía null para esa sección) y el único camino para
 * acreditar un efectivo recibido en la mesa era Finanzas, desde otra pantalla.
 *
 * El test fija las dos mitades: que la fila trabada por una orden manual ofrezca
 * la validación con el comprobante a la vista, y que sin
 * `admin.payments.approve` no la ofrezca.
 */

vi.mock('../src/services/athleteApi.js', () => ({
  getAthletePaymentProofUrl: vi.fn(async () => 'https://cdn.example/proof.jpg'),
}))

vi.mock('../src/services/ticketApi.js', () => ({
  getTicketPaymentProofUrl: vi.fn(async () => 'https://cdn.example/ticket.pdf'),
}))

// La puerta monta el escáner y el sync offline; ninguno de los dos es el sujeto
// de este test y los dos piden APIs que jsdom no tiene.
vi.mock('../src/components/admin/AdminQrScanner.jsx', () => ({
  default: () => null,
}))

vi.mock('../src/hooks/useOfflineCheckinSync.js', () => ({
  useOfflineCheckinSync: () => ({
    conflictCount: 0,
    downloadAllowlist: () => {},
    isOnline: true,
    lastDownloadedAt: null,
    lastSyncedAt: null,
    pendingCount: 0,
    syncNow: () => {},
    syncing: false,
  }),
}))

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
})

afterEach(() => cleanup())

const CheckInSection = (await import('../src/pages/admin/CheckInSection.jsx')).default

const ATHLETE = { id: 'ath-1', fullName: 'Ana Torres', documentId: '30111222' }

const REGISTRATION = {
  id: 'reg-1',
  athleteId: 'ath-1',
  eventSlug: 'pitbull-classic-2026',
  category: 'Open',
  division: 'Raw',
  status: 'pendiente_pago',
  paymentOrderId: 'ord-1',
  schedule: null,
  checkedInAt: null,
}

const CASH_ORDER = {
  id: 'ord-1',
  athleteId: 'ath-1',
  concept: 'combo',
  amount: 170000,
  method: 'manual_link',
  manualPaymentChannel: 'cash_pitbull',
  status: 'validacion_manual',
  reference: 'PLU-COMBO-1',
  paymentProofPath: null,
}

function renderCheckin(overrides = {}) {
  return render(
    <I18nProvider>
      <CheckInSection
        athletes={[ATHLETE]}
        canCheckIn
        canValidatePayments
        eventSlug="pitbull-classic-2026"
        onApprovePayment={vi.fn(async () => ({ order: { status: 'aprobado' } }))}
        onCheckInRegistration={vi.fn()}
        onCheckInTicket={vi.fn()}
        onRejectPayment={vi.fn(async () => ({ order: { status: 'rechazado' } }))}
        payments={[CASH_ORDER]}
        registrations={[REGISTRATION]}
        tickets={[]}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('Check-in — cobro en la puerta', () => {
  it('ofrece acreditar la orden manual que traba el ingreso', async () => {
    const onApprovePayment = vi.fn(async () => ({ order: { status: 'aprobado' } }))
    renderCheckin({ onApprovePayment })

    const settle = screen.getByRole('button', { name: /cobrar y acreditar/i })
    // El ingreso sigue bloqueado mientras la orden esté abierta.
    expect(screen.getByRole('button', { name: /registrar ingreso/i }).disabled).toBe(true)

    fireEvent.click(settle)

    const dialog = await screen.findByRole('dialog')
    // Efectivo en sede: el diálogo pide confirmar el cobro, no un archivo.
    expect(within(dialog).getByText(/cobro presencial en pitbull/i)).toBeTruthy()
    expect(within(dialog).getByText('Ana Torres')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: /confirmar validación/i }))
    await waitFor(() => expect(onApprovePayment).toHaveBeenCalledWith('ord-1'))
  })

  it('cuenta las órdenes por cobrar y las deja filtrar', () => {
    renderCheckin()
    expect(screen.getAllByText(/por cobrar/i).length).toBeGreaterThan(0)
  })

  it('sin permiso de pagos no ofrece acreditar, pero sí informa la deuda', () => {
    // El contador es información, no una acción: la puerta necesita saber por
    // qué la persona no puede entrar aunque tenga que llamar a Finanzas.
    renderCheckin({ canValidatePayments: false })
    expect(screen.queryByRole('button', { name: /cobrar y acreditar/i })).toBeNull()
    expect(screen.getAllByText(/por cobrar/i).length).toBeGreaterThan(0)
  })

  it('no ofrece acreditar una orden de Mercado Pago', () => {
    renderCheckin({ payments: [{ ...CASH_ORDER, method: 'mercado_pago' }] })
    expect(screen.queryByRole('button', { name: /cobrar y acreditar/i })).toBeNull()
  })
})
