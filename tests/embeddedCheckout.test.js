import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { createEmbeddedRecurringSubscription } from '../server/modules/subscriptions/subscriptionWorkflow.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

const ORDER_ID = '8cb43d94-b330-4e69-a2d0-76a56916ebf5'

function paymentOrder() {
  return {
    id: ORDER_ID,
    kind: 'athlete',
    athleteId: 'athlete-1',
    amount: 25000,
    currency: 'ARS',
    displayConcept: 'Afiliacion PLU',
    method: 'mercado_pago',
    status: 'pendiente',
    payerEmail: 'atleta@example.com',
  }
}

describe('Mercado Pago Checkout Bricks', () => {
  it('audita un error de render del Brick sin recibir datos de tarjeta', async () => {
    const recordClientEvent = vi.fn(async () => undefined)
    const repository = {
      getOrder: vi.fn(async () => ({
        ...paymentOrder(),
        organizationId: '2a101541-0674-4a35-a840-56ed879d0440',
        kind: 'ticket',
        athleteId: null,
      })),
      assertTicketOrderAccess: vi.fn(async () => ({ id: ORDER_ID })),
      recordClientEvent,
    }
    const target = listen(createApp({ paymentRepository: repository }))

    const response = await fetch(`${target.url}/api/payments/telemetry`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({
        paymentOrderId: ORDER_ID,
        orderAccessToken: 'test-order-access-token-with-enough-entropy',
        stage: 'render',
        errorCode: 'brick_mount_failed',
        message: 'No se pudo montar el checkout',
      }),
    })
    await target.close()

    expect(response.status).toBe(202)
    expect(recordClientEvent).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'render',
      errorCode: 'brick_mount_failed',
    }))
    expect(recordClientEvent.mock.calls[0][0]).not.toHaveProperty('cardToken')
  })

  it('descarta el monto del navegador y procesa la orden autoritativa', async () => {
    let received
    const repository = {
      getOrder: vi.fn(async () => ({ ...paymentOrder(), kind: 'ticket', athleteId: null })),
      assertTicketOrderAccess: vi.fn(async () => ({ id: ORDER_ID })),
      claimEmbeddedAttempt: vi.fn(async () => ({
        created: true,
        attempt: { id: 'attempt-1', idempotency_key: 'server-key' },
      })),
      completeEmbeddedAttempt: vi.fn(async () => undefined),
      applyPayment: vi.fn(async () => ({ order: { id: ORDER_ID, status: 'aprobado' } })),
    }
    const mercadoPago = {
      createPayment: vi.fn(async (input) => {
        received = input
        return {
          id: 'mp-1',
          status: 'approved',
          status_detail: 'accredited',
          transaction_amount: input.order.amount,
          currency_id: input.order.currency,
          external_reference: input.order.id,
          payment_method_id: input.formData.payment_method_id,
          payment_type_id: 'credit_card',
          payer: { email: input.formData.payer.email },
        }
      }),
    }
    const target = listen(createApp({
      paymentRepository: repository,
      mercadoPago,
      env: { APP_PRODUCTION: 'false', PAID_CHECKOUT_ENABLED: 'true' },
    }))

    const response = await fetch(`${target.url}/api/payments/embedded/process`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({
        paymentOrderId: ORDER_ID,
        orderAccessToken: 'test-order-access-token-with-enough-entropy',
        formData: {
          token: 'temporary-card-token',
          payment_method_id: 'visa',
          installments: 1,
          payer: { email: 'atleta@example.com' },
          transaction_amount: 1,
        },
      }),
    })
    const body = await response.json()
    await target.close()

    expect(response.status).toBe(201)
    expect(body.payment.status).toBe('approved')
    expect(received.order.amount).toBe(25000)
    expect(received.formData).not.toHaveProperty('transaction_amount')
    expect(received.idempotencyKey).toBe('server-key')
    expect(repository.assertTicketOrderAccess).toHaveBeenCalledOnce()
  })

  it('autoriza la suscripcion embebida con token sin persistir la tarjeta', async () => {
    let providerInput
    const repository = {
      prepareSubscription: vi.fn(async () => ({
        order: paymentOrder(),
        plan: {
          id: 'plan-1',
          code: 'plu-monthly',
          name: 'PLU mensual',
          price: 25000,
          currency: 'ARS',
          billing_frequency: 'monthly',
          collection_mode: 'recurring',
          interval_count: 1,
          grace_days: 5,
          provider_plan_id: 'provider-plan-1',
        },
        subscription: {
          id: 'subscription-1',
          external_reference: `SUB-${ORDER_ID}`,
          provider_subscription_id: null,
        },
      })),
      claimEmbeddedAttempt: vi.fn(async () => ({
        created: true,
        attempt: { id: 'attempt-2', idempotency_key: 'subscription-server-key' },
      })),
      attachSubscriptionProvider: vi.fn(async (_id, value) => ({ id: 'subscription-1', status: value.status })),
      completeEmbeddedAttempt: vi.fn(async () => undefined),
    }
    const mercadoPago = {
      createSubscription: vi.fn(async (input) => {
        providerInput = input
        return { id: 'preapproval-1', status: 'authorized' }
      }),
    }

    const result = await createEmbeddedRecurringSubscription({
      paymentOrderId: ORDER_ID,
      planCode: 'plu-monthly',
      cardToken: 'temporary-card-token',
      appUrl: 'https://plu.example',
    }, { repository, mercadoPago })

    expect(result.subscription.status).toBe('authorized')
    expect(providerInput.cardToken).toBe('temporary-card-token')
    expect(providerInput.idempotencyKey).toBe('subscription-server-key')
    expect(repository.claimEmbeddedAttempt).toHaveBeenCalledWith(expect.objectContaining({
      operationKind: 'subscription',
    }))
    expect(repository.completeEmbeddedAttempt).toHaveBeenCalledWith('attempt-2', expect.objectContaining({
      externalPaymentId: 'preapproval-1',
      status: 'submitted',
    }))
  })
})
