import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import RegistrationsSection from '../src/pages/admin/RegistrationsSection.jsx'

/**
 * `onForceSettlePayment` y `canForceSettle` llegaban a `RegistrationsSection`
 * desde `AdminPage` pero el componente nunca los desestructuraba: "acreditar a
 * mano" y "revalidar" solo existían en Finanzas, y una orden de Mercado Pago
 * rechazada con la plata ya adentro obligaba a salir de Inscripciones para
 * arreglarla. Este test fija que la fila los ofrece.
 */

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      membershipValidationEnabled: true,
      registrationValidationEnabled: true,
      ticketValidationEnabled: true,
    })),
  }
})

vi.mock('../src/services/paymentService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, revalidatePaymentOrder: vi.fn() }
})

vi.mock('../src/services/athleteApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getAthletePaymentProofUrl: vi.fn(async () => 'https://proof.example/1.jpg') }
})

const { revalidatePaymentOrder } = await import('../src/services/paymentService.js')

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function registration(overrides = {}) {
  return {
    id: 'reg-1',
    athleteId: 'ath-1',
    athlete: { fullName: 'Ana Torres', documentId: '30111222' },
    event: 'Pitbull Classic 2026',
    eventSlug: 'pitbull-classic-2026',
    paymentOrderId: 'ord-1',
    category: 'Raw',
    division: 'Open',
    status: 'cancelada',
    schedule: null,
    ...overrides,
  }
}

function payment(overrides = {}) {
  return {
    id: 'ord-1',
    athleteId: 'ath-1',
    event: 'Pitbull Classic 2026',
    method: 'mercado_pago',
    status: 'rechazado',
    amount: 45000,
    currency: 'ARS',
    ...overrides,
  }
}

function renderSection(props = {}) {
  const registrations = props.registrations ?? [registration()]
  return render(
    <I18nProvider>
      <RegistrationsSection
        canEdit
        filters={{ event: 'all', status: 'all', query: '' }}
        filteredRegistrations={registrations}
        payments={[payment()]}
        registrations={registrations}
        registrationsCount={registrations.length}
        onApprovePayment={() => {}}
        onExportAdmin={() => {}}
        onExportPluUsa={() => {}}
        onSetFilters={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('Inscripciones — recuperar un pago rechazado/cancelado', () => {
  it('ofrece revalidar sin permiso especial, y llama al servicio con la orden de la fila', async () => {
    revalidatePaymentOrder.mockResolvedValue({ outcome: 'in_sync', corrected: false })
    renderSection({ canForceSettle: false })

    const button = screen.getByRole('button', { name: 'Revalidar con Mercado Pago' })
    fireEvent.click(button)

    await waitFor(() => expect(revalidatePaymentOrder).toHaveBeenCalledWith('ord-1'))
  })

  it('no ofrece acreditar a mano sin el permiso de Finanzas', () => {
    renderSection({ canForceSettle: false })
    expect(screen.queryByRole('button', { name: 'Acreditar a mano' })).toBeNull()
  })

  it('con el permiso, acreditar a mano llama a onForceSettlePayment con el id de la orden', async () => {
    const onForceSettlePayment = vi.fn(async () => ({ order: payment({ status: 'aprobado' }) }))
    renderSection({
      canForceSettle: true,
      onForceSettlePayment,
      payments: [payment({ paymentProofPath: 'ord-1/comprobante.jpg' })],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Acreditar a mano' }))
    fireEvent.change(screen.getByLabelText('Motivo de la acreditación'), {
      target: { value: 'Transferencia recibida, comprobante en el grupo.' },
    })
    const confirm = () => screen.getByRole('button', { name: 'Acreditar el cobro' })
    await waitFor(() => expect(confirm().disabled).toBe(false))
    fireEvent.click(confirm())

    await waitFor(() => expect(onForceSettlePayment).toHaveBeenCalledTimes(1))
    expect(onForceSettlePayment.mock.calls[0][0]).toBe('ord-1')
  })
})
