import { describe, expect, it } from 'vitest'
import { createMercadoPagoAdapter } from '../server/modules/payments/mercadoPagoAdapter.js'

const order = {
  id: 'order-1',
  kind: 'athlete',
  amount: 25_000,
  currency: 'ARS',
  displayConcept: 'Afiliacion PLU',
  payerEmail: 'atleta@example.com',
}

describe('adaptador de Mercado Pago', () => {
  it('rechaza credenciales placeholder antes de construir el cliente', () => {
    expect(() => createMercadoPagoAdapter({
      env: { MERCADO_PAGO_ACCESS_TOKEN: 'replace-me' },
    })).toThrow('Mercado Pago no esta configurado')

    expect(() => createMercadoPagoAdapter({
      env: { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-xxxx' },
    })).toThrow('Mercado Pago no esta configurado')
  })

  it('exige HTTPS para el webhook productivo antes de enviar el pago', async () => {
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'production',
        API_URL: 'http://pagos.example.com',
      },
    })

    await expect(adapter.createPayment({
      order,
      idempotencyKey: 'embedded-payment-order-1',
      formData: { payment_method_id: 'visa', payer: { email: order.payerEmail } },
    })).rejects.toMatchObject({ status: 503, message: 'API_URL o APP_URL debe usar HTTPS.' })
  })

  it('limita la idempotency key al contrato de Mercado Pago', async () => {
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'sandbox',
        API_URL: 'http://localhost:3001',
      },
    })

    await expect(adapter.createPayment({
      order,
      idempotencyKey: 'x'.repeat(65),
      formData: { payment_method_id: 'visa', payer: { email: order.payerEmail } },
    })).rejects.toMatchObject({ status: 503 })
  })
})
