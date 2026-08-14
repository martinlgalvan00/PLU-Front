import { beforeEach, describe, expect, it, vi } from 'vitest'

const captures = vi.hoisted(() => ({ preference: null, payment: null }))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class MercadoPagoConfig {},
  Preference: class Preference {
    async create(payload) {
      captures.preference = payload
      return {
        id: 'pref-pitbull-75k',
        init_point: 'https://mercadopago.test/checkout',
        sandbox_init_point: 'https://sandbox.mercadopago.test/checkout',
        external_reference: payload.body.external_reference,
      }
    }
  },
  Payment: class Payment {
    async create(payload) {
      captures.payment = payload
      return { id: 'payment-pitbull-75k', status: 'approved', ...payload.body }
    }
  },
  PreApproval: class PreApproval {},
  PreApprovalPlan: class PreApprovalPlan {},
}))

const { createMercadoPagoAdapter } = await import(
  '../server/modules/payments/mercadoPagoAdapter.js'
)

const order = {
  id: 'pitbull-registration-order',
  kind: 'athlete',
  athleteId: 'athlete-test',
  amount: 75000,
  currency: 'ARS',
  displayConcept: 'Inscripción Pitbull Classic',
  payerEmail: 'atleta@example.com',
}

describe('monto Pitbull enviado a Mercado Pago', () => {
  beforeEach(() => {
    captures.preference = null
    captures.payment = null
  })

  it('usa ARS 75.000 tanto en Checkout Pro como en el Payment Brick', async () => {
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token-valid',
        MERCADO_PAGO_ENV: 'sandbox',
        APP_URL: 'http://localhost:5173',
      },
    })

    await adapter.createPreference({
      order,
      idempotencyKey: 'pitbull-preference-75k',
    })
    await adapter.createPayment({
      order,
      idempotencyKey: 'pitbull-payment-75k',
      formData: {
        token: 'card-token',
        payment_method_id: 'visa',
        installments: 1,
        payer: { email: order.payerEmail },
      },
    })

    expect(captures.preference.body.items).toEqual([
      expect.objectContaining({ currency_id: 'ARS', quantity: 1, unit_price: 75000 }),
    ])
    expect(captures.payment.body).toMatchObject({
      transaction_amount: 75000,
      external_reference: order.id,
      notification_url: 'http://localhost:5173/api/payments/webhook/mercadopago',
    })
  })
})
