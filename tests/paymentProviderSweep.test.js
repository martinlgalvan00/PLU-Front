import { describe, expect, it, vi } from 'vitest'
import { sweepClosedOrdersAgainstProvider } from '../server/modules/payments/paymentRecoveryWorkflow.js'

/**
 * La red contra "en Mercado Pago figura pagado y en la app dice cancelado".
 *
 * El webhook y la conciliación del Brick cubren los caminos que dejan rastro
 * local. Este barrido cubre el que no deja ninguno: la orden venció por cron sin
 * un solo asiento de cobro y el pago existe igual del lado del proveedor.
 */
const ORDEN_CANCELADA = {
  id: '25195dbe-29d3-4903-aa73-bdf8ce47c9fb',
  kind: 'athlete',
  concept: 'registration',
  amount: 120000,
  currency: 'ARS',
  method: 'mercado_pago',
  status: 'cancelado',
}

function contexto({ providerPayments }) {
  const repository = {
    listClosedOrdersWithoutPayments: vi.fn().mockResolvedValue([ORDEN_CANCELADA.id]),
    getOrder: vi.fn().mockResolvedValue(ORDEN_CANCELADA),
    applyPayment: vi.fn().mockResolvedValue({ order: { ...ORDEN_CANCELADA, status: 'aprobado' } }),
  }
  const mercadoPago = { searchPaymentsForOrder: vi.fn().mockResolvedValue(providerPayments) }
  return { repository, mercadoPago }
}

describe('barrido de órdenes cerradas contra el proveedor', () => {
  it('reabre una orden cancelada cuyo pago sí entró en Mercado Pago', async () => {
    const { repository, mercadoPago } = contexto({
      providerPayments: [
        {
          id: '987654321',
          external_reference: ORDEN_CANCELADA.id,
          status: 'approved',
          status_detail: 'accredited',
          transaction_amount: 120000,
          currency_id: 'ARS',
          date_approved: '2026-08-20T16:00:00.000Z',
        },
      ],
    })

    const summary = await sweepClosedOrdersAgainstProvider({ repository, mercadoPago })

    expect(summary).toMatchObject({ checked: 1, recovered: 1 })
    expect(repository.applyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ externalPaymentId: '987654321', status: 'aprobado' }),
    )
  })

  it('no toca nada si el proveedor coincide con lo que dice la app', async () => {
    const { repository, mercadoPago } = contexto({
      providerPayments: [
        {
          id: '111',
          external_reference: ORDEN_CANCELADA.id,
          status: 'cancelled',
          transaction_amount: 120000,
          currency_id: 'ARS',
        },
      ],
    })

    const summary = await sweepClosedOrdersAgainstProvider({ repository, mercadoPago })

    expect(summary.recovered).toBe(0)
    expect(repository.applyPayment).not.toHaveBeenCalled()
  })

  it('elige el pago aprobado aunque haya rechazos más nuevos', async () => {
    const { repository, mercadoPago } = contexto({
      providerPayments: [
        {
          id: '222',
          external_reference: ORDEN_CANCELADA.id,
          status: 'rejected',
          transaction_amount: 120000,
          currency_id: 'ARS',
          date_created: '2026-08-20T18:00:00.000Z',
        },
        {
          id: '333',
          external_reference: ORDEN_CANCELADA.id,
          status: 'approved',
          transaction_amount: 120000,
          currency_id: 'ARS',
          date_approved: '2026-08-20T16:00:00.000Z',
        },
      ],
    })

    await sweepClosedOrdersAgainstProvider({ repository, mercadoPago })

    expect(repository.applyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ externalPaymentId: '333', status: 'aprobado' }),
    )
  })

  it('un monto que no coincide no se acredita: queda como falla del barrido', async () => {
    const { repository, mercadoPago } = contexto({
      providerPayments: [
        {
          id: '444',
          external_reference: ORDEN_CANCELADA.id,
          status: 'approved',
          transaction_amount: 1,
          currency_id: 'ARS',
        },
      ],
    })

    const summary = await sweepClosedOrdersAgainstProvider({ repository, mercadoPago })

    expect(summary.recovered).toBe(0)
    expect(summary.failures).toHaveLength(1)
    expect(repository.applyPayment).not.toHaveBeenCalled()
  })

  it('se desactiva solo si el repositorio o el proveedor no lo soportan', async () => {
    const summary = await sweepClosedOrdersAgainstProvider({ repository: {}, mercadoPago: {} })
    expect(summary).toEqual({ checked: 0, recovered: 0, failures: [] })
  })

  // La orden que reportó la organización no está cancelada: está `pendiente`.
  // El barrido miraba sólo cancelado/rechazado, así que ese caso -- "pagó por
  // Mercado Pago, figura pendiente y no da de alta" -- no tenía ningún camino de
  // rescate hasta que el cron de dominio la cerrara.
  it('barre también las pendientes con la ventana vencida', async () => {
    const ordenPendiente = { ...ORDEN_CANCELADA, status: 'pendiente' }
    const repository = {
      listOrdersWithoutLocalPayment: vi.fn().mockResolvedValue([ordenPendiente.id]),
      getOrder: vi.fn().mockResolvedValue(ordenPendiente),
      applyPayment: vi.fn().mockResolvedValue({ order: { ...ordenPendiente, status: 'aprobado' } }),
    }
    const mercadoPago = {
      searchPaymentsForOrder: vi.fn().mockResolvedValue([
        {
          id: '555',
          external_reference: ordenPendiente.id,
          status: 'approved',
          status_detail: 'accredited',
          transaction_amount: 120000,
          currency_id: 'ARS',
        },
      ]),
    }

    const summary = await sweepClosedOrdersAgainstProvider({ repository, mercadoPago })

    expect(repository.listOrdersWithoutLocalPayment).toHaveBeenCalled()
    expect(summary).toMatchObject({ checked: 1, recovered: 1 })
  })

  // Un repositorio que todavía exponga el nombre viejo tiene que seguir
  // funcionando: el barrido se degradaba a "desactivado" en silencio, que es la
  // peor forma de romperse para una red de contención.
  it('acepta el nombre anterior del listado', async () => {
    const { repository, mercadoPago } = contexto({
      providerPayments: [
        {
          id: '666',
          external_reference: ORDEN_CANCELADA.id,
          status: 'approved',
          status_detail: 'accredited',
          transaction_amount: 120000,
          currency_id: 'ARS',
        },
      ],
    })

    const summary = await sweepClosedOrdersAgainstProvider({ repository, mercadoPago })

    expect(repository.listClosedOrdersWithoutPayments).toHaveBeenCalled()
    expect(summary).toMatchObject({ checked: 1, recovered: 1 })
  })
})
