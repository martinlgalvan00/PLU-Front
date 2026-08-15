import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AthletePaymentOrdersSection from '../src/pages/admin/AthletePaymentOrdersSection.jsx'
import { listAthletePaymentOrders } from '../src/services/athleteApi.js'
import { revalidatePaymentOrder } from '../src/services/paymentService.js'

/**
 * La orden figura `cancelado` en el panel pero la plata entró. La salida no es
 * acreditar a mano: es preguntarle a Mercado Pago y aplicar lo que conteste.
 * Esta prueba cubre que la acción exista donde tiene que estar (órdenes de MP),
 * que el resultado se lea sin abrir la traza y que la fila quede al día.
 */

vi.mock('../src/services/athleteApi.js', () => ({
  listAthletePaymentOrders: vi.fn(),
  getAthletePaymentProofUrl: vi.fn(async () => 'https://cdn.example/proof.jpg'),
}))

vi.mock('../src/services/paymentService.js', () => ({
  revalidatePaymentOrder: vi.fn(),
}))

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  window.requestAnimationFrame ??= (callback) => setTimeout(() => callback(0), 0)
  window.cancelAnimationFrame ??= (handle) => clearTimeout(handle)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const MP_ORDER = {
  id: 'ord-mp-1',
  athlete: { fullName: 'Agustín Díaz', documentId: '30111222' },
  concept: 'membership',
  conceptLabel: 'Afiliación',
  amount: 85000,
  currency: 'ARS',
  method: 'mercado_pago',
  status: 'cancelado',
  reference: 'MP-1755000000000',
  createdAt: '2026-08-10T12:00:00.000Z',
  paymentProofPath: null,
}

const TRANSFER_ORDER = {
  ...MP_ORDER,
  id: 'ord-manual-1',
  method: 'manual_link',
  status: 'pendiente',
  reference: 'MANUAL-1755000000001',
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <AthletePaymentOrdersSection canEdit canForceSettle {...props} />
    </I18nProvider>,
  )
}

describe('revalidación contra Mercado Pago en la caja de Finanzas', () => {
  it('ofrece la acción solo en las órdenes que cobra Mercado Pago', async () => {
    listAthletePaymentOrders.mockResolvedValue([MP_ORDER, TRANSFER_ORDER])
    renderSection({ statusFilter: { status: 'all', at: 1 } })

    // La tabla del panel dibuja fila de escritorio y ficha mobile, asi que la
    // accion aparece dos veces por orden: dos botones = una sola orden de MP.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Revalidar con Mercado Pago' })).toHaveLength(2),
    )
  })

  it('no la ofrece sin permiso de edición', async () => {
    listAthletePaymentOrders.mockResolvedValue([MP_ORDER])
    render(
      <I18nProvider>
        <AthletePaymentOrdersSection canEdit={false} statusFilter={{ status: 'all', at: 1 }} />
      </I18nProvider>,
    )

    await waitFor(() => expect(screen.getByText('MP-1755000000000')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Revalidar con Mercado Pago' })).toBeNull()
  })

  it('corrige la fila con lo que responde el proveedor y lo deja a la vista', async () => {
    listAthletePaymentOrders.mockResolvedValue([MP_ORDER])
    revalidatePaymentOrder.mockResolvedValue({
      order: { id: MP_ORDER.id, reference: MP_ORDER.reference },
      localStatus: 'cancelado',
      providerStatus: 'aprobado',
      resultStatus: 'aprobado',
      divergent: true,
      applied: true,
      corrected: true,
      outcome: 'corrected',
    })
    renderSection({ statusFilter: { status: 'all', at: 1 } })

    const [action] = await screen.findAllByRole('button', { name: 'Revalidar con Mercado Pago' })
    fireEvent.click(action)

    await waitFor(() =>
      expect(screen.getByText('Estado corregido con la respuesta de Mercado Pago')).toBeTruthy(),
    )
    expect(revalidatePaymentOrder).toHaveBeenCalledWith(MP_ORDER.id)
    // El aviso enfrenta los dos estados: el que figuraba y el del proveedor.
    expect(
      screen.getByText(/en el panel: Cancelado · en Mercado Pago: Aprobado/),
    ).toBeTruthy()
    // Y la fila queda al día sin recargar las 200 órdenes.
    expect(screen.getAllByText('Aprobado').length).toBeGreaterThan(0)
  })

  it('dice cuando el proveedor no tiene ningún pago, sin tocar el estado', async () => {
    listAthletePaymentOrders.mockResolvedValue([MP_ORDER])
    revalidatePaymentOrder.mockResolvedValue({
      order: { id: MP_ORDER.id, reference: MP_ORDER.reference },
      localStatus: 'cancelado',
      providerStatus: null,
      resultStatus: 'cancelado',
      divergent: false,
      applied: false,
      corrected: false,
      outcome: 'no_provider_payment',
    })
    renderSection({ statusFilter: { status: 'all', at: 1 } })

    const [action] = await screen.findAllByRole('button', { name: 'Revalidar con Mercado Pago' })
    fireEvent.click(action)

    await waitFor(() =>
      expect(screen.getByText('Mercado Pago no tiene pagos de esta orden')).toBeTruthy(),
    )
    expect(screen.getByText(/en Mercado Pago: sin pagos registrados/)).toBeTruthy()
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
  })

  it('muestra el error del proveedor sin dejar la fila en un estado inventado', async () => {
    listAthletePaymentOrders.mockResolvedValue([MP_ORDER])
    revalidatePaymentOrder.mockRejectedValue(new Error('Mercado Pago no está configurado.'))
    renderSection({ statusFilter: { status: 'all', at: 1 } })

    const [action] = await screen.findAllByRole('button', { name: 'Revalidar con Mercado Pago' })
    fireEvent.click(action)

    await waitFor(() => expect(screen.getByText('Mercado Pago no está configurado.')).toBeTruthy())
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
  })
})
