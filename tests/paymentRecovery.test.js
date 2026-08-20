import { describe, expect, it, vi } from 'vitest'
import { recoverPaymentOperations } from '../server/modules/payments/paymentRecoveryWorkflow.js'

const order = {
  id: 'order-1',
  kind: 'athlete',
  method: 'mercado_pago',
  status: 'pendiente',
  amount: 75000,
  currency: 'ARS',
  payerEmail: 'athlete@example.com',
}

const payment = {
  id: 'payment-1',
  external_reference: 'order-1',
  status: 'approved',
  transaction_amount: 75000,
  currency_id: 'ARS',
  payer: { email: 'athlete@example.com' },
}

describe('payment recovery workflow', () => {
  it('recupera webhooks y concilia intentos embebidos en el mismo ciclo', async () => {
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => [
        {
          id: 'event-1',
          event_type: 'payment',
          resource_id: 'payment-1',
        },
      ]),
      claimEmbeddedReconciliations: vi.fn(async () => [
        {
          id: 'attempt-1',
          order_id: 'order-1',
          external_payment_id: 'payment-1',
        },
      ]),
      getOrder: vi.fn(async () => order),
      applyPayment: vi.fn(async () => ({ order: { ...order, status: 'aprobado' } })),
      markWebhookProcessed: vi.fn(async (_id, result) => ({
        id: 'event-1',
        status: 'processed',
        result,
      })),
      markWebhookFailed: vi.fn(),
      completeEmbeddedReconciliation: vi.fn(),
    }
    const mercadoPago = { getPayment: vi.fn(async () => payment) }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    expect(result.events).toMatchObject({ claimed: 1, processed: 1, failed: 0, failures: [] })
    expect(result.reconciliations).toMatchObject({
      claimed: 1,
      processed: 1,
      failed: 0,
      failures: [],
    })
    expect(repository.markWebhookProcessed).toHaveBeenCalledWith('event-1', expect.any(Object))
    expect(repository.completeEmbeddedReconciliation).toHaveBeenCalledWith('attempt-1', {
      succeeded: true,
      terminal: true,
    })
  })

  it('aísla una falla y la deja programada para reintento', async () => {
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => [
        {
          id: 'event-2',
          event_type: 'payment',
          resource_id: 'missing-payment',
        },
      ]),
      claimEmbeddedReconciliations: vi.fn(async () => []),
      markWebhookFailed: vi.fn(async () => undefined),
    }
    const mercadoPago = {
      getPayment: vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
    }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    // El resumen identifica QUE fallo y por que: sin esto, "failed: 1" obligaba
    // a abrir la base para saber cual de los eventos reclamados se cayo.
    expect(result.events).toMatchObject({
      claimed: 1,
      processed: 0,
      failed: 1,
      failures: [{ id: 'event-2', error: 'provider unavailable' }],
    })
    expect(repository.markWebhookFailed).toHaveBeenCalledWith('event-2', expect.any(Error))
    // El texto persistido lleva el codigo del catalogo para que el panel
    // muestre algo accionable sin consultar los logs.
    const [, persisted] = repository.markWebhookFailed.mock.calls[0]
    expect(persisted.message).toContain('[MP_TIMEOUT]')
    expect(persisted.cause).toBeInstanceOf(Error)
  })

  it('recupera por external_reference cuando el id creado despues responde 404', async () => {
    const notFound = Object.assign(new Error('Payment not found'), {
      provider: { apiResponseStatus: 404, code: 2000 },
    })
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => []),
      claimEmbeddedReconciliations: vi.fn(async () => [
        {
          id: 'attempt-missing-id',
          order_id: order.id,
          order_kind: 'athlete',
          external_payment_id: 'missing-payment',
        },
      ]),
      getOrder: vi.fn(async () => order),
      applyPayment: vi.fn(async () => ({ order: { ...order, status: 'aprobado' } })),
      completeEmbeddedReconciliation: vi.fn(),
    }
    const mercadoPago = {
      getPayment: vi.fn(async () => {
        throw notFound
      }),
      searchPaymentsForOrder: vi.fn(async () => [payment]),
    }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    expect(mercadoPago.searchPaymentsForOrder).toHaveBeenCalledWith(order)
    expect(result.reconciliations).toMatchObject({ claimed: 1, processed: 1, failed: 0 })
    expect(repository.completeEmbeddedReconciliation).toHaveBeenCalledWith('attempt-missing-id', {
      succeeded: true,
      terminal: true,
    })
  })

  it('no consulta ni acredita un intento creado por otra cuenta cobradora', async () => {
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => []),
      claimEmbeddedReconciliations: vi.fn(async () => [
        {
          id: 'attempt-other-collector',
          order_id: order.id,
          order_kind: 'athlete',
          external_payment_id: 'payment-from-other-app',
          provider_payload: { collector_id: 359152682 },
        },
      ]),
      getOrder: vi.fn(async () => order),
      applyPayment: vi.fn(),
      completeEmbeddedReconciliation: vi.fn(),
    }
    const mercadoPago = {
      getAccountIdentity: vi.fn(async () => ({ id: '3601496880' })),
      getPayment: vi.fn(),
    }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    expect(mercadoPago.getPayment).not.toHaveBeenCalled()
    expect(repository.applyPayment).not.toHaveBeenCalled()
    expect(repository.completeEmbeddedReconciliation).toHaveBeenCalledWith(
      'attempt-other-collector',
      expect.objectContaining({ succeeded: false, error: expect.stringContaining('MP_ACCOUNT_MISMATCH') }),
    )
    expect(result.reconciliations).toMatchObject({ claimed: 1, processed: 0, failed: 1 })
  })

  it('no acredita ni descarta el intento si el id y la referencia no existen', async () => {
    const notFound = Object.assign(new Error('Payment not found'), {
      provider: { apiResponseStatus: 404, code: 2000 },
    })
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => []),
      claimEmbeddedReconciliations: vi.fn(async () => [
        {
          id: 'attempt-unresolved',
          order_id: order.id,
          order_kind: 'athlete',
          external_payment_id: 'missing-payment',
        },
      ]),
      getOrder: vi.fn(async () => order),
      applyPayment: vi.fn(),
      completeEmbeddedReconciliation: vi.fn(),
    }
    const mercadoPago = {
      getPayment: vi.fn(async () => {
        throw notFound
      }),
      searchPaymentsForOrder: vi.fn(async () => []),
    }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    expect(repository.applyPayment).not.toHaveBeenCalled()
    expect(repository.completeEmbeddedReconciliation).toHaveBeenCalledWith(
      'attempt-unresolved',
      expect.objectContaining({ succeeded: false }),
    )
    expect(result.reconciliations).toMatchObject({ claimed: 1, processed: 0, failed: 1 })
  })
})
