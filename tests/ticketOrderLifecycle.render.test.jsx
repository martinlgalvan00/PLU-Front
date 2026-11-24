import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Cancelar y volver a aceptar desde Cobros › Entradas: qué fila ofrece qué
 * acción, que el motivo sea obligatorio sólo cuando la orden estaba acreditada
 * y que el error de cupo del servidor se muestre tal cual en el diálogo.
 */

const listTicketOrders = vi.fn()
const cancelTicketOrder = vi.fn()
const reinstateTicketOrder = vi.fn()

vi.mock('../src/services/ticketApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listTicketOrders: (...args) => listTicketOrders(...args),
    cancelTicketOrder: (...args) => cancelTicketOrder(...args),
    reinstateTicketOrder: (...args) => reinstateTicketOrder(...args),
  }
})

const TicketOrdersSection = (await import('../src/pages/admin/TicketOrdersSection.jsx')).default

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

afterEach(() => {
  cleanup()
  listTicketOrders.mockReset()
  cancelTicketOrder.mockReset()
  reinstateTicketOrder.mockReset()
})

function order(overrides = {}) {
  return {
    orderId: 'ord-1',
    reference: 'TORD-abc123',
    amount: 15000,
    currency: 'ARS',
    status: 'aprobado',
    provider: 'manual',
    manualPaymentChannel: 'bank_transfer',
    paymentProofPath: 'ord-1/proof.png',
    paymentProofUploadedAt: '2026-03-01T12:00:00.000Z',
    createdAt: '2026-03-01T12:00:00.000Z',
    eventSlug: 'pitbull-classic-2026',
    eventTitle: 'Pitbull Classic 2026',
    ticketCount: 1,
    attendees: [{ name: 'Camila Rearte', dni: '30111222' }],
    buyerEmail: 'compra@example.com',
    ...overrides,
  }
}

function renderWith(orders) {
  listTicketOrders.mockResolvedValue({
    orders,
    counts: { pending: 0, aprobado: 1, rechazado: 1, cancelado: 0, all: orders.length },
  })
  return render(
    <I18nProvider>
      <TicketOrdersSection canEdit events={[]} pendingTicketOrders={[]} />
    </I18nProvider>,
  )
}

describe('TicketOrdersSection · cancelar y volver a aceptar', () => {
  it('ofrece cancelar una aprobada manual y no una de Mercado Pago', async () => {
    renderWith([
      order(),
      order({
        orderId: 'ord-mp',
        reference: 'TORD-mp',
        provider: 'mercado_pago',
        manualPaymentChannel: null,
        attendees: [{ name: 'Pago Online', dni: '30999888' }],
      }),
    ])

    const manualRow = (await screen.findByText('TORD-abc123')).closest('tr')
    expect(within(manualRow).getByRole('button', { name: 'Cancelar orden' })).toBeTruthy()

    const mpRow = screen.getByText('TORD-mp').closest('tr')
    expect(within(mpRow).queryByRole('button', { name: 'Cancelar orden' })).toBeNull()
  })

  it('exige motivo para cancelar una aprobada y lo manda al servicio', async () => {
    cancelTicketOrder.mockResolvedValue({})
    renderWith([order()])

    const row = (await screen.findByText('TORD-abc123')).closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Cancelar orden' }))

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Cancelar orden' })
    expect(confirm.disabled).toBe(true)

    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'Transferencia revertida' },
    })
    expect(confirm.disabled).toBe(false)
    const readsBefore = listTicketOrders.mock.calls.length
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(cancelTicketOrder).toHaveBeenCalledWith('ord-1', 'Transferencia revertida'),
    )
    // Después de cancelar se relee la lista para reflejar el estado real.
    await waitFor(() =>
      expect(listTicketOrders.mock.calls.length).toBeGreaterThan(readsBefore),
    )
  })

  it('vuelve a aceptar una rechazada y muestra el motivo anterior', async () => {
    reinstateTicketOrder.mockResolvedValue({})
    renderWith([order({ status: 'rechazado', rejectionReason: 'Monto incorrecto' })])

    const row = (await screen.findByText('TORD-abc123')).closest('tr')
    expect(within(row).getByText('Monto incorrecto')).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Volver a aceptar' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Monto incorrecto')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a aceptar' }))

    await waitFor(() => expect(reinstateTicketOrder).toHaveBeenCalledWith('ord-1'))
  })

  it('deja el diálogo abierto con el error de cupo del servidor', async () => {
    reinstateTicketOrder.mockRejectedValue(
      new Error('No queda cupo para General (120 de 120 ocupados).'),
    )
    renderWith([
      order({
        status: 'cancelado',
        cancellationReason: 'Pidió devolución',
        cancelledAt: '2026-11-20T10:00:00.000Z',
      }),
    ])

    const row = (await screen.findByText('TORD-abc123')).closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Volver a aceptar' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a aceptar' }))

    expect(
      await within(dialog).findByText('No queda cupo para General (120 de 120 ocupados).'),
    ).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('una vencida por el cron con comprobante ofrece Acreditar, no volver a aceptar', async () => {
    renderWith([order({ status: 'cancelado', cancelledAt: null })])

    const row = (await screen.findByText('TORD-abc123')).closest('tr')
    expect(within(row).queryByRole('button', { name: 'Volver a aceptar' })).toBeNull()
    expect(within(row).getByRole('button', { name: /acreditar/i })).toBeTruthy()
  })

  it('sin permiso de edición no ofrece ninguna de las dos acciones', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [order(), order({ orderId: 'ord-2', reference: 'TORD-r', status: 'rechazado' })],
      counts: { pending: 0, aprobado: 1, rechazado: 1, cancelado: 0, all: 2 },
    })
    render(
      <I18nProvider>
        <TicketOrdersSection canEdit={false} events={[]} pendingTicketOrders={[]} />
      </I18nProvider>,
    )
    await screen.findByText('TORD-abc123')
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Volver a aceptar' })).toBeNull()
  })
})
