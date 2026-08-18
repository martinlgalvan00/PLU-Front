import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  createPaymentProviderAdapter,
  getPaymentsRuntimeStatus,
  isPaymentsMockEnvironmentAllowed,
  resetSharedMockPaymentAdapter,
  resolvePaymentsProvider,
} from '../server/modules/payments/createPaymentProviderAdapter.js'
import { createMockMercadoPagoAdapter } from '../server/modules/payments/mockMercadoPagoAdapter.js'
import { processEmbeddedPayment } from '../server/modules/payments/embeddedPaymentWorkflow.js'

const order = {
  id: '11111111-1111-1111-1111-111111111111',
  kind: 'athlete',
  method: 'mercado_pago',
  status: 'pendiente',
  amount: 25_000,
  currency: 'ARS',
  displayConcept: 'Afiliacion PLU',
  payerEmail: 'atleta@example.com',
}

function createRepositoryFake(seedOrder = order) {
  const attempts = new Map()
  return {
    async getOrder() {
      return { ...seedOrder }
    },
    async claimEmbeddedAttempt({ order: claimedOrder, tokenFingerprint, idempotencyKey }) {
      const existing = [...attempts.values()].find(
        (item) => item.order_id === claimedOrder.id && item.token_fingerprint === tokenFingerprint,
      )
      if (existing) return { created: false, attempt: existing }
      const attempt = {
        id: `attempt-${attempts.size + 1}`,
        order_id: claimedOrder.id,
        token_fingerprint: tokenFingerprint,
        idempotency_key: idempotencyKey,
        external_payment_id: null,
      }
      attempts.set(attempt.id, attempt)
      return { created: true, attempt }
    },
    async completeEmbeddedAttempt(attemptId, payload) {
      const attempt = attempts.get(attemptId)
      if (!attempt) return null
      Object.assign(attempt, {
        status: payload.status,
        external_payment_id: payload.externalPaymentId ?? attempt.external_payment_id,
      })
      return attempt
    },
    async completeEmbeddedReconciliation() {
      return true
    },
    async applyPayment(payment) {
      return {
        order: { ...seedOrder, status: payment.status },
        payment,
      }
    },
  }
}

describe('createPaymentProviderAdapter', () => {
  beforeEach(() => {
    resetSharedMockPaymentAdapter()
  })

  it('resuelve mercado_pago por default', () => {
    expect(resolvePaymentsProvider({})).toBe('mercado_pago')
  })

  it('prioriza PAYMENTS_MOCK true|false sobre PAYMENTS_PROVIDER', () => {
    expect(
      resolvePaymentsProvider({ PAYMENTS_MOCK: 'true', PAYMENTS_PROVIDER: 'mercado_pago' }),
    ).toBe('mock')
    expect(resolvePaymentsProvider({ PAYMENTS_MOCK: 'false', PAYMENTS_PROVIDER: 'mock' })).toBe(
      'mercado_pago',
    )
    expect(resolvePaymentsProvider({ PAYMENTS_PROVIDER: 'mock' })).toBe('mock')
  })

  it('rechaza PAYMENTS_MOCK invalido', () => {
    expect(() => resolvePaymentsProvider({ PAYMENTS_MOCK: 'maybe' })).toThrow(
      /PAYMENTS_MOCK invalido/,
    )
  })

  it('permite mock solo fuera de production/preview', () => {
    expect(isPaymentsMockEnvironmentAllowed({ NODE_ENV: 'development' })).toBe(true)
    expect(isPaymentsMockEnvironmentAllowed({ NODE_ENV: 'production' })).toBe(false)
    expect(
      isPaymentsMockEnvironmentAllowed({ NODE_ENV: 'development', VERCEL_ENV: 'preview' }),
    ).toBe(false)
    expect(
      isPaymentsMockEnvironmentAllowed({ NODE_ENV: 'development', VERCEL_ENV: 'production' }),
    ).toBe(false)
  })

  it('rechaza mock en production', () => {
    expect(() =>
      createPaymentProviderAdapter({
        env: { PAYMENTS_PROVIDER: 'mock', NODE_ENV: 'production' },
      }),
    ).toThrow(/solo esta permitido en local\/dev/)
  })

  it('crea el adaptador real cuando provider=mercado_pago', () => {
    expect(() =>
      createPaymentProviderAdapter({
        env: {
          PAYMENTS_PROVIDER: 'mercado_pago',
          MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
          MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret-for-tests',
          VITE_MERCADO_PAGO_PUBLIC_KEY: 'TEST-public-key',
        },
      }),
    ).not.toThrow()
  })

  it('impide iniciar cobros reales sin webhook firmado configurable', () => {
    expect(() =>
      createPaymentProviderAdapter({
        env: {
          PAYMENTS_PROVIDER: 'mercado_pago',
          MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        },
      }),
    ).toThrow(/WEBHOOK_SECRET valido/)
  })

  it('expone un diagnostico seguro y completo para Finanzas', () => {
    expect(
      getPaymentsRuntimeStatus({
        PAYMENTS_PROVIDER: 'mercado_pago',
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret-for-tests',
        VITE_MERCADO_PAGO_PUBLIC_KEY: 'TEST-public-key',
      }),
    ).toEqual({
      provider: 'mercado_pago',
      ready: true,
      accessTokenConfigured: true,
      webhookConfigured: true,
      publicKeyConfigured: true,
      webhookProcessingMode: 'inline',
      issues: [],
    })

    const broken = getPaymentsRuntimeStatus({ PAYMENTS_PROVIDER: 'mercado_pago' })
    expect(broken.ready).toBe(false)
    expect(broken.issues).toHaveLength(3)

    const configured = getPaymentsRuntimeStatus({
      PAYMENTS_PROVIDER: 'mercado_pago',
      MERCADO_PAGO_ACCESS_TOKEN: 'private-access-value',
      MERCADO_PAGO_WEBHOOK_SECRET: 'private-webhook-value',
      VITE_MERCADO_PAGO_PUBLIC_KEY: 'public-key-value',
    })
    expect(JSON.stringify(configured)).not.toContain('private-access-value')
    expect(JSON.stringify(configured)).not.toContain('private-webhook-value')
  })
})

describe('mockMercadoPagoAdapter', () => {
  it('mapea outcomes canónicos y respeta monto/moneda/orden', async () => {
    const adapter = createMockMercadoPagoAdapter()
    const approved = await adapter.createPayment({
      order,
      idempotencyKey: 'key-approved',
      formData: {
        payment_method_id: 'mock_approved',
        payer: { email: order.payerEmail },
      },
    })

    expect(approved.status).toBe('approved')
    expect(approved.transaction_amount).toBe(order.amount)
    expect(approved.currency_id).toBe(order.currency)
    expect(approved.external_reference).toBe(order.id)

    const rejected = await adapter.createPayment({
      order,
      idempotencyKey: 'key-rejected',
      formData: {
        payment_method_id: 'mock_rejected',
        payer: { email: order.payerEmail },
      },
    })
    expect(rejected.status).toBe('rejected')

    const pending = await adapter.createPayment({
      order,
      idempotencyKey: 'key-pending',
      formData: {
        payment_method_id: 'mock_pending',
        payer: { email: order.payerEmail },
      },
    })
    expect(pending.status).toBe('in_process')

    const forced = await adapter.updatePaymentStatus(pending.id, 'approved')
    expect(forced.status).toBe('approved')
    expect((await adapter.getPayment(pending.id)).status).toBe('approved')
  })

  it('simula falla del proveedor con mock_error', async () => {
    const adapter = createMockMercadoPagoAdapter()
    await expect(
      adapter.createPayment({
        order,
        idempotencyKey: 'key-error',
        formData: {
          payment_method_id: 'mock_error',
          payer: { email: order.payerEmail },
        },
      }),
    ).rejects.toMatchObject({ status: 502 })
  })

  it('aplica delay configurable sin superar el tope', async () => {
    const adapter = createMockMercadoPagoAdapter({
      env: { MOCK_PAYMENT_DELAY_MS: '25' },
    })
    const started = Date.now()
    await adapter.createPayment({
      order,
      idempotencyKey: 'key-delay',
      formData: {
        payment_method_id: 'mock_approved',
        payer: { email: order.payerEmail },
      },
    })
    expect(Date.now() - started).toBeGreaterThanOrEqual(20)
  })

  it('reusa preference y payment por idempotency key', async () => {
    const adapter = createMockMercadoPagoAdapter()
    const first = await adapter.createPreference({
      order,
      idempotencyKey: 'pref-1',
    })
    const second = await adapter.createPreference({
      order,
      idempotencyKey: 'pref-1',
    })
    expect(second.id).toBe(first.id)

    const pay1 = await adapter.createPayment({
      order,
      idempotencyKey: 'pay-1',
      formData: { payment_method_id: 'mock_approved', payer: { email: order.payerEmail } },
    })
    const pay2 = await adapter.createPayment({
      order,
      idempotencyKey: 'pay-1',
      formData: { payment_method_id: 'mock_approved', payer: { email: order.payerEmail } },
    })
    expect(pay2.id).toBe(pay1.id)
  })
})

describe('processEmbeddedPayment con mock', () => {
  it('devuelve la orden aprobada sin volver a invocar al proveedor', async () => {
    const repository = createRepositoryFake({ ...order, status: 'aprobado' })
    const mercadoPago = createMockMercadoPagoAdapter()
    const createPayment = mercadoPago.createPayment
    mercadoPago.createPayment = async (...args) => createPayment(...args)
    const createPaymentSpy = vi.spyOn(mercadoPago, 'createPayment')

    const result = await processEmbeddedPayment(
      {
        paymentOrderId: order.id,
        formData: {
          token: 'token-repetido-despues-de-acreditar',
          payment_method_id: 'mock_approved',
          payer: { email: order.payerEmail },
        },
      },
      { repository, mercadoPago },
    )

    expect(result).toMatchObject({ duplicate: true, payment: null })
    expect(result.order.status).toBe('aprobado')
    expect(createPaymentSpy).not.toHaveBeenCalled()
  })

  it('acredita una orden aprobada por el camino real', async () => {
    const repository = createRepositoryFake()
    const mercadoPago = createMockMercadoPagoAdapter()
    const result = await processEmbeddedPayment(
      {
        paymentOrderId: order.id,
        formData: {
          token: 'mock_card_token_local_dev_only',
          payment_method_id: 'mock_approved',
          payer: { email: order.payerEmail },
        },
      },
      { repository, mercadoPago },
    )

    expect(result.duplicate).toBe(false)
    expect(result.payment.status).toBe('approved')
    expect(result.order.status).toBe('aprobado')
  })

  it('deja pendiente cuando el mock responde in_process', async () => {
    const repository = createRepositoryFake()
    const mercadoPago = createMockMercadoPagoAdapter()
    const result = await processEmbeddedPayment(
      {
        paymentOrderId: order.id,
        formData: {
          token: 'mock_card_token_local_dev_only',
          payment_method_id: 'mock_pending',
          payer: { email: order.payerEmail },
        },
      },
      { repository, mercadoPago },
    )

    expect(result.payment.status).toBe('in_process')
    expect(result.order.status).toBe('pendiente')
  })

  it('reconcilia contra el proveedor en vez de fallar cuando createPayment explota pero MP ya cobró', async () => {
    const repository = createRepositoryFake()
    const mercadoPago = {
      createPayment: vi.fn(async () => {
        throw new Error('socket hang up')
      }),
      searchPaymentsForOrder: vi.fn(async () => [
        {
          id: 'mp-provider-side-charge',
          status: 'approved',
          status_detail: 'accredited',
          transaction_amount: order.amount,
          currency_id: order.currency,
          external_reference: order.id,
          payer: { email: order.payerEmail },
        },
      ]),
    }

    const result = await processEmbeddedPayment(
      {
        paymentOrderId: order.id,
        formData: {
          token: 'temporary-card-token',
          payment_method_id: 'visa',
          payer: { email: order.payerEmail },
        },
      },
      { repository, mercadoPago },
    )

    expect(mercadoPago.searchPaymentsForOrder).toHaveBeenCalledOnce()
    expect(result.duplicate).toBe(false)
    expect(result.payment.id).toBe('mp-provider-side-charge')
    expect(result.order.status).toBe('aprobado')
  })

  it('sigue fallando si createPayment explota y el proveedor no tiene ningún pago para la orden', async () => {
    const repository = createRepositoryFake()
    const mercadoPago = {
      createPayment: vi.fn(async () => {
        throw new Error('socket hang up')
      }),
      searchPaymentsForOrder: vi.fn(async () => []),
    }

    await expect(
      processEmbeddedPayment(
        {
          paymentOrderId: order.id,
          formData: {
            token: 'temporary-card-token',
            payment_method_id: 'visa',
            payer: { email: order.payerEmail },
          },
        },
        { repository, mercadoPago },
      ),
    ).rejects.toThrow('socket hang up')
  })
})
