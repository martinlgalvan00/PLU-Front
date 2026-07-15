import { describe, expect, it, vi } from 'vitest'
import { recoverPaymentOperations } from '../server/modules/payments/paymentRecoveryWorkflow.js'

const order = {
  id: 'order-1',
  kind: 'athlete',
  method: 'mercado_pago',
  status: 'pendiente',
  amount: 38000,
  currency: 'ARS',
  payerEmail: 'athlete@example.com',
}

const payment = {
  id: 'payment-1',
  external_reference: 'order-1',
  status: 'approved',
  transaction_amount: 38000,
  currency_id: 'ARS',
  payer: { email: 'athlete@example.com' },
}

describe('payment recovery workflow', () => {
  it('recupera webhooks y concilia intentos embebidos en el mismo ciclo', async () => {
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => [{
        id: 'event-1',
        event_type: 'payment',
        resource_id: 'payment-1',
      }]),
      claimEmbeddedReconciliations: vi.fn(async () => [{
        id: 'attempt-1',
        order_id: 'order-1',
        external_payment_id: 'payment-1',
      }]),
      getOrder: vi.fn(async () => order),
      applyPayment: vi.fn(async () => ({ order: { ...order, status: 'aprobado' } })),
      markWebhookProcessed: vi.fn(async (_id, result) => ({ id: 'event-1', status: 'processed', result })),
      markWebhookFailed: vi.fn(),
      completeEmbeddedReconciliation: vi.fn(),
    }
    const mercadoPago = { getPayment: vi.fn(async () => payment) }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    expect(result.events).toEqual({ claimed: 1, processed: 1, failed: 0 })
    expect(result.reconciliations).toEqual({ claimed: 1, processed: 1, failed: 0 })
    expect(repository.markWebhookProcessed).toHaveBeenCalledWith('event-1', expect.any(Object))
    expect(repository.completeEmbeddedReconciliation).toHaveBeenCalledWith('attempt-1', {
      succeeded: true,
      terminal: true,
    })
  })

  it('aísla una falla y la deja programada para reintento', async () => {
    const repository = {
      claimDueWebhookEvents: vi.fn(async () => [{
        id: 'event-2',
        event_type: 'payment',
        resource_id: 'missing-payment',
      }]),
      claimEmbeddedReconciliations: vi.fn(async () => []),
      markWebhookFailed: vi.fn(async () => undefined),
    }
    const mercadoPago = { getPayment: vi.fn(async () => { throw new Error('provider unavailable') }) }

    const result = await recoverPaymentOperations({ repository, mercadoPago })

    expect(result.events).toEqual({ claimed: 1, processed: 0, failed: 1 })
    expect(repository.markWebhookFailed).toHaveBeenCalledWith('event-2', expect.any(Error))
  })
})
