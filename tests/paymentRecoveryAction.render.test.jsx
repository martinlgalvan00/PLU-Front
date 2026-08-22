import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PaymentRecoveryAction from '../src/components/admin/PaymentRecoveryAction.jsx'

/**
 * "El pago figura cancelado/rechazado pero la plata entró": revalidar contra
 * Mercado Pago o acreditar a mano, disponibles desde donde el operador ya está
 * mirando a la persona (Inscripciones, Afiliaciones), no solo desde Finanzas.
 *
 * Mismas reglas de elegibilidad que `AthletePaymentOrdersSection` — este
 * componente es el que ahora comparten las tres pantallas.
 */

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

afterEach(cleanup)

function order(overrides = {}) {
  return {
    id: 'ord-1',
    method: 'mercado_pago',
    status: 'rechazado',
    amount: 85000,
    currency: 'ARS',
    paymentProofPath: null,
    ...overrides,
  }
}

function renderAction(props = {}) {
  return render(
    <I18nProvider>
      <PaymentRecoveryAction order={order()} {...props} />
    </I18nProvider>,
  )
}

describe('PaymentRecoveryAction', () => {
  it('no muestra nada para una orden ya aprobada', () => {
    const { container } = renderAction({ order: order({ status: 'aprobado' }) })
    expect(container.textContent).toBe('')
  })

  it('ofrece revalidar para cualquier orden de Mercado Pago, sin permiso especial', () => {
    renderAction({ canForceSettle: false })
    expect(screen.getByRole('button', { name: 'Revalidar con Mercado Pago' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Acreditar a mano' })).toBeNull()
  })

  it('revalida, avisa el resultado y refresca si corrigió el estado', async () => {
    revalidatePaymentOrder.mockResolvedValue({ outcome: 'corrected', corrected: true })
    const onRefreshAthleteData = vi.fn()
    renderAction({ onRefreshAthleteData })

    fireEvent.click(screen.getByRole('button', { name: 'Revalidar con Mercado Pago' }))

    await waitFor(() => expect(onRefreshAthleteData).toHaveBeenCalledTimes(1))
    expect(revalidatePaymentOrder).toHaveBeenCalledWith('ord-1')
  })

  it('revalidates with the copied Mercado Pago operation number', async () => {
    revalidatePaymentOrder.mockResolvedValue({ outcome: 'corrected', corrected: true })
    renderAction()

    fireEvent.click(screen.getByRole('button', { name: 'Validar N.º de operación' }))
    fireEvent.change(screen.getByLabelText('N.º de operación de Mercado Pago'), {
      target: { value: '174125987189' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Validar operación' }))

    await waitFor(() =>
      expect(revalidatePaymentOrder).toHaveBeenCalledWith('ord-1', {
        providerPaymentId: '174125987189',
      }),
    )
  })

  it('no refresca si la revalidación no encontró nada para corregir', async () => {
    revalidatePaymentOrder.mockResolvedValue({ outcome: 'no_provider_payment', corrected: false })
    const onRefreshAthleteData = vi.fn()
    renderAction({ onRefreshAthleteData })

    fireEvent.click(screen.getByRole('button', { name: 'Revalidar con Mercado Pago' }))

    await waitFor(() => expect(revalidatePaymentOrder).toHaveBeenCalled())
    expect(onRefreshAthleteData).not.toHaveBeenCalled()
  })

  it('refresca la tabla si el proveedor se aplicó aunque no cambie el resumen', async () => {
    revalidatePaymentOrder.mockResolvedValue({ outcome: 'unchanged', corrected: false, applied: true })
    const onRefreshAthleteData = vi.fn()
    renderAction({ onRefreshAthleteData })

    fireEvent.click(screen.getByRole('button', { name: 'Revalidar con Mercado Pago' }))

    await waitFor(() => expect(onRefreshAthleteData).toHaveBeenCalledTimes(1))
  })

  it('un pago rechazado no-Mercado-Pago solo ofrece acreditar a mano, con permiso', () => {
    renderAction({ order: order({ method: 'manual_link' }), canForceSettle: true })
    expect(screen.queryByRole('button', { name: 'Revalidar con Mercado Pago' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Acreditar a mano' })).toBeTruthy()
  })

  it('sin permiso de acreditar a mano, una orden rechazada no-MP no ofrece nada', () => {
    const { container } = renderAction({
      order: order({ method: 'manual_link' }),
      canForceSettle: false,
    })
    expect(container.textContent).toBe('')
  })

  it('acreditar a mano pide comprobante y motivo, y llama a onForceSettlePayment', async () => {
    const onForceSettlePayment = vi.fn(async () => ({ order: order({ status: 'aprobado' }) }))
    const onRefreshAthleteData = vi.fn()
    renderAction({
      order: order({ paymentProofPath: 'ord-1/comprobante.jpg' }),
      canForceSettle: true,
      onForceSettlePayment,
      onRefreshAthleteData,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Acreditar a mano' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    const confirm = () => screen.getByRole('button', { name: 'Acreditar el cobro' })
    await waitFor(() => expect(confirm().disabled).toBe(true))

    fireEvent.change(screen.getByLabelText('Motivo de la acreditación'), {
      target: { value: 'Transferencia recibida el 20/08, comprobante adjunto.' },
    })
    await waitFor(() => expect(confirm().disabled).toBe(false))

    fireEvent.click(confirm())

    await waitFor(() => expect(onForceSettlePayment).toHaveBeenCalledTimes(1))
    expect(onForceSettlePayment).toHaveBeenCalledWith('ord-1', {
      reason: 'Transferencia recibida el 20/08, comprobante adjunto.',
      reference: '',
    })
    await waitFor(() => expect(onRefreshAthleteData).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
