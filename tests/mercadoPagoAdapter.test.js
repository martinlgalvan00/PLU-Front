import { beforeEach, describe, expect, it, vi } from 'vitest'

const mpMocks = vi.hoisted(() => ({
  preferenceCreate: vi.fn(),
  paymentCreate: vi.fn(),
  paymentGet: vi.fn(),
}))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: vi.fn(function MercadoPagoConfig(config) {
    this.config = config
  }),
  Payment: vi.fn(function Payment() {
    this.create = mpMocks.paymentCreate
    this.get = mpMocks.paymentGet
  }),
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
    mpMocks.paymentCreate.mockReset()
    mpMocks.paymentGet.mockReset()
    vi.unstubAllGlobals()
  })

  it('rechaza credenciales placeholder antes de construir el cliente', () => {
    expect(() =>
      createMercadoPagoAdapter({
        env: { MERCADO_PAGO_ACCESS_TOKEN: 'replace-me' },
      }),
    ).toThrow('Mercado Pago no esta configurado')

    expect(() =>
      createMercadoPagoAdapter({
        env: { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-xxxx' },
      }),
    ).toThrow('Mercado Pago no esta configurado')
  })

  it('exige HTTPS para el webhook productivo antes de enviar el pago', async () => {
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'production',
        API_URL: 'http://pagos.example.com',
      },
    })

    await expect(
      adapter.createPayment({
        order,
        idempotencyKey: 'embedded-payment-order-1',
        formData: { payment_method_id: 'visa', payer: { email: order.payerEmail } },
      }),
    ).rejects.toMatchObject({ status: 503, message: 'API_URL o APP_URL debe usar HTTPS.' })
  })

  it('limita la idempotency key al contrato de Mercado Pago', async () => {
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'sandbox',
        API_URL: 'http://localhost:3001',
      },
    })

    await expect(
      adapter.createPayment({
        order,
        idempotencyKey: 'x'.repeat(65),
        formData: { payment_method_id: 'visa', payer: { email: order.payerEmail } },
      }),
    ).rejects.toMatchObject({ status: 503 })
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

    expect(mpMocks.preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          notification_url: 'https://www.powerliftingunited.ar/api/payments/webhook/mercadopago',
          items: [
            expect.objectContaining({
              title: 'Afiliacion PLU',
              category_id: 'services',
            }),
          ],
          back_urls: expect.objectContaining({
            success: 'https://www.powerliftingunited.ar/perfil?payment=success&order=order-1',
          }),
        }),
        requestOptions: expect.objectContaining({ idempotencyKey: 'membership-order-1' }),
      }),
    )
  })

  it('bloquea crear un checkout si el token no pertenece al collector configurado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 999, nickname: 'cuenta-ajena' }), { status: 200 }),
      ),
    )
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_COLLECTOR_ID: '111',
        MERCADO_PAGO_ENV: 'sandbox',
        APP_URL: 'http://localhost:5173',
      },
    })

    await expect(
      adapter.createPreference({ order, idempotencyKey: 'collector-identity-order-1' }),
    ).rejects.toMatchObject({
      status: 503,
      provider: { code: 'MP_ACCOUNT_MISMATCH', expectedCollectorId: '111' },
    })
    expect(mpMocks.preferenceCreate).not.toHaveBeenCalled()
  })

  it('no informa un falso “sin pagos” al revalidar con un token de otra cuenta', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 999, nickname: 'cuenta-ajena' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_COLLECTOR_ID: '111',
        MERCADO_PAGO_ENV: 'sandbox',
      },
    })

    await expect(adapter.searchPaymentsForOrder(order)).rejects.toMatchObject({
      status: 503,
      provider: { code: 'MP_ACCOUNT_MISMATCH', expectedCollectorId: '111' },
    })
    // Primero se valida /users/me; no se consulta el search de una cuenta que
    // no es la cobradora, porque su lista vacía sería un falso negativo.
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toContain('/users/me')
  })

  it('redirige las inscripciones de atleta al perfil', async () => {
    mpMocks.preferenceCreate.mockResolvedValueOnce({
      id: 'pref-registration',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-registration',
      sandbox_init_point:
        'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-registration',
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

    expect(mpMocks.preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          back_urls: expect.objectContaining({
            success:
              'https://www.powerliftingunited.ar/perfil?payment=success&order=registration-order-1',
          }),
        }),
      }),
    )
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

    // Con `www`: el apex responde 308 hacia él y Mercado Pago no sigue
    // redirects, así que la notificación se daba por fallida. Esta afirmación
    // fijaba el apex, que era justamente el valor roto.
    expect(mpMocks.preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          notification_url: 'https://www.powerliftingunited.ar/api/payments/webhook/mercadopago',
        }),
      }),
    )
  })

  /**
   * La defensa que importa: corregir la constante no alcanzaba porque
   * `resolveApiUrl` lee `env.API_URL` y `env.APP_URL` antes que el valor
   * derivado del deployment. Una variable de Vercel cargada con el apex —el
   * dominio que uno escribe de memoria— reintroducía el bug entero, y otra vez
   * sin síntoma visible.
   */
  it('promueve el apex a www aunque las variables de entorno traigan el apex', async () => {
    mpMocks.preferenceCreate.mockResolvedValueOnce({
      id: 'pref-3',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-3',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-3',
    })
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'production',
        APP_URL: 'https://powerliftingunited.ar',
        API_URL: 'https://powerliftingunited.ar',
      },
    })

    await adapter.createPreference({ order, idempotencyKey: 'membership-order-3' })

    const body = mpMocks.preferenceCreate.mock.calls.at(-1)[0].body
    expect(body.notification_url).toBe(
      'https://www.powerliftingunited.ar/api/payments/webhook/mercadopago',
    )
    // Las back_urls pasan por el mismo normalizador: un redirect ahí no pierde
    // el cobro, pero manda al atleta por un salto extra al volver del checkout.
    expect(body.back_urls.success).toContain('https://www.powerliftingunited.ar/')
  })

  it('reintenta un 500 puntual del search y devuelve los pagos reales', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'internal' }), { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: 111, status: 'approved', external_reference: 'order-1' }],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn(async () => {})
    const adapter = createMercadoPagoAdapter({
      env: { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token', MERCADO_PAGO_ENV: 'sandbox' },
      retryOptions: { sleep, random: () => 0.5 },
    })

    const payments = await adapter.searchPaymentsForOrder(order)

    expect(payments).toHaveLength(1)
    expect(payments[0].id).toBe(111)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('ante un 429 espera el Retry-After del proveedor antes de reintentar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'rate limited' }), {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn(async () => {})
    const adapter = createMercadoPagoAdapter({
      env: { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token', MERCADO_PAGO_ENV: 'sandbox' },
      retryOptions: { sleep, random: () => 0 },
    })

    await adapter.searchPaymentsForOrder(order)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('NO reintenta la creacion de un pago ante un 5xx: el cobro pudo entrar igual', async () => {
    const providerError = Object.assign(new Error('internal error'), { status: 500 })
    mpMocks.paymentCreate.mockRejectedValue(providerError)
    const sleep = vi.fn(async () => {})
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'sandbox',
        API_URL: 'http://localhost:3001',
      },
      retryOptions: { sleep, random: () => 0.5 },
    })

    await expect(
      adapter.createPayment({
        order,
        idempotencyKey: 'embedded-payment-order-1',
        formData: { payment_method_id: 'visa', payer: { email: order.payerEmail } },
      }),
    ).rejects.toMatchObject({ status: 503 })
    // Un solo POST: el "que paso con la plata" lo responde la reconciliacion
    // por external_reference, no un segundo POST a ciegas.
    expect(mpMocks.paymentCreate).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('la lectura de un pago reintenta el corte de red y entrega el recurso', async () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    mpMocks.paymentGet
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce({ id: 222, status: 'approved', external_reference: 'order-1' })
    const sleep = vi.fn(async () => {})
    const adapter = createMercadoPagoAdapter({
      env: { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token', MERCADO_PAGO_ENV: 'sandbox' },
      retryOptions: { sleep, random: () => 0.5 },
    })

    const payment = await adapter.getPayment(222)

    expect(payment.id).toBe(222)
    expect(mpMocks.paymentGet).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('no toca dominios que no son el apex oficial', async () => {
    mpMocks.preferenceCreate.mockResolvedValueOnce({
      id: 'pref-4',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-4',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-4',
    })
    const adapter = createMercadoPagoAdapter({
      env: {
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-access-token',
        MERCADO_PAGO_ENV: 'sandbox',
        APP_URL: 'https://plu-git-dev.example.vercel.app',
      },
    })

    await adapter.createPreference({ order, idempotencyKey: 'membership-order-4' })

    expect(mpMocks.preferenceCreate.mock.calls.at(-1)[0].body.notification_url).toBe(
      'https://plu-git-dev.example.vercel.app/api/payments/webhook/mercadopago',
    )
  })
})
