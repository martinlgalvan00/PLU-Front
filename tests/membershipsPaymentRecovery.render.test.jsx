import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MembershipsSection from '../src/pages/admin/MembershipsSection.jsx'

/**
 * `MembershipsSection` no recibía `payments` en absoluto: no había forma de
 * saber, desde Afiliaciones, si la orden detrás de una afiliación `cancelada`
 * seguía viva en Mercado Pago o si la plata había entrado por otro lado. Este
 * test fija que, con `payments` conectado, la fila ofrece revalidar/acreditar
 * a mano igual que Inscripciones y Finanzas.
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

function membership(overrides = {}) {
  return {
    id: 'mem-1',
    athleteId: 'ath-1',
    athlete: { fullName: 'Ana Torres', documentId: '30111222' },
    memberCode: 'PLU-ARG-2026-014',
    year: '2026',
    status: 'cancelada',
    paymentOrderId: 'ord-1',
    startDate: '2026-01-01',
    expirationDate: `${new Date().getFullYear() + 1}-12-31`,
    ...overrides,
  }
}

function payment(overrides = {}) {
  return {
    id: 'ord-1',
    method: 'mercado_pago',
    status: 'rechazado',
    amount: 65000,
    currency: 'ARS',
    ...overrides,
  }
}

function renderSection(items, props = {}) {
  return render(
    <I18nProvider>
      <MembershipsSection memberships={items} payments={[payment()]} canManage {...props} />
    </I18nProvider>,
  )
}

describe('Afiliaciones — recuperar un pago rechazado/cancelado', () => {
  it('ofrece revalidar sin permiso especial, contra la orden vinculada por paymentOrderId', async () => {
    revalidatePaymentOrder.mockResolvedValue({ outcome: 'in_sync', corrected: false })
    renderSection([membership()], { canForceSettle: false })

    fireEvent.click(screen.getByRole('button', { name: 'Revalidar con Mercado Pago' }))

    await waitFor(() => expect(revalidatePaymentOrder).toHaveBeenCalledWith('ord-1'))
  })

  it('no ofrece acreditar a mano sin el permiso de Finanzas', () => {
    renderSection([membership()], { canForceSettle: false })
    expect(screen.queryByRole('button', { name: 'Acreditar a mano' })).toBeNull()
  })

  it('con el permiso, acreditar a mano llama a onForceSettlePayment con el id de la orden', async () => {
    const onForceSettlePayment = vi.fn(async () => ({ order: payment({ status: 'aprobado' }) }))
    renderSection([membership()], {
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

  it('una afiliación sin orden vinculada no ofrece ninguna acción de recuperación', () => {
    renderSection([membership({ paymentOrderId: null, status: 'activa' })], {
      canForceSettle: true,
    })
    expect(screen.queryByRole('button', { name: 'Revalidar con Mercado Pago' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acreditar a mano' })).toBeNull()
  })

  it('concentra la corrección manual de la afiliación en Editar estado y conserva motivo y canal', async () => {
    const onSetMembershipStatus = vi.fn(async () => ({}))
    renderSection([membership()], { onSetMembershipStatus })

    fireEvent.click(screen.getByRole('button', { name: 'Corregir estado' }))
    fireEvent.change(screen.getByLabelText('Canal'), {
      target: { value: 'bank_transfer' },
    })
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Transferencia recibida y comprobante revisado.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))

    await waitFor(() =>
      expect(onSetMembershipStatus).toHaveBeenCalledWith('mem-1', 'activa', {
        reason: 'Transferencia recibida y comprobante revisado.',
        channel: 'bank_transfer',
      }),
    )
  })
})
