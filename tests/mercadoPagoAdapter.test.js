import { beforeEach, describe, expect, it, vi } from 'vitest'

const mpMocks = vi.hoisted(() => ({
  preferenceCreate: vi.fn(),
}))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: vi.fn(function MercadoPagoConfig(config) {
    this.config = config
  }),
  Payment: vi.fn(function Payment() {}),
  PreApproval: vi.fn(function PreApproval() {}),
  PreApprovalPlan: vi.fn(function PreApprovalPlan() {}),
  Preference: vi.fn(function Preference() {
    this.create = mpMocks.preferenceCreate
  }),
}))

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
  beforeEach(() => {
    mpMocks.preferenceCreate.mockReset()
  })

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

  it('usa APP_URL como webhook cuando API_URL no esta configurada', async () => {
    mpMocks.preferenceCreate.mockResolvedValueOnce({
      id: 'pref-1',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1',
    })
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'production',
        APP_URL: 'https://powerliftingunited.ar',
      },
    })

    await adapter.createPreference({
      order,
      idempotencyKey: 'membership-order-1',
    })

    expect(mpMocks.preferenceCreate).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        notification_url: 'https://powerliftingunited.ar/api/payments/webhook/mercadopago',
        items: [expect.objectContaining({
          title: 'Afiliacion PLU',
          category_id: 'services',
        })],
        back_urls: expect.objectContaining({
          success: 'https://powerliftingunited.ar/perfil?payment=success&order=order-1',
        }),
      }),
      requestOptions: expect.objectContaining({ idempotencyKey: 'membership-order-1' }),
    }))
  })

  it('redirige las inscripciones de atleta al perfil', async () => {
    mpMocks.preferenceCreate.mockResolvedValueOnce({
      id: 'pref-registration',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-registration',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-registration',
    })
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'production',
        APP_URL: 'https://powerliftingunited.ar',
      },
    })

    await adapter.createPreference({
      order: { ...order, id: 'registration-order-1', concept: 'registration' },
      idempotencyKey: 'registration-order-1',
    })

    expect(mpMocks.preferenceCreate).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        back_urls: expect.objectContaining({
          success: 'https://powerliftingunited.ar/perfil?payment=success&order=registration-order-1',
        }),
      }),
    }))
  })

  it('usa la URL oficial como fallback en produccion Vercel', async () => {
    mpMocks.preferenceCreate.mockResolvedValueOnce({
      id: 'pref-2',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-2',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-2',
    })
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'production',
        VERCEL_ENV: 'production',
      },
    })

    await adapter.createPreference({
      order,
      idempotencyKey: 'membership-order-2',
    })

    expect(mpMocks.preferenceCreate).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        notification_url: 'https://powerliftingunited.ar/api/payments/webhook/mercadopago',
      }),
    }))
  })
})
