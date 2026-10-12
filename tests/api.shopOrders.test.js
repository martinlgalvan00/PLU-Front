import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  assertShopMethodOpen,
  assertShopPaymentMatchesOrder,
  resolveShopCheckoutOptions,
  toBuyerOrderView,
} from '../server/modules/shop/shopCheckout.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

const ORDER_ID = '3f2b5d1e-1111-4222-8333-444455556666'
const PRODUCT_ID = '9a1b5d1e-1111-4222-8333-444455556666'
const TOKEN = 'a'.repeat(43)
const SECRET = 'webhook-secret-de-prueba'

const baseSettings = {
  mercadoPagoEnabled: true,
  bankTransferEnabled: true,
  cashEnabled: true,
  mercadoPagoProfileId: null,
  bankTransferProfileId: null,
  cashInstructions: 'Sede Banfield, sábados de 10 a 13',
  fulfillmentNote: 'Retiro en sede',
}

const env = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  PAYMENTS_MOCK: 'true',
  PAYMENT_TRANSFER_ALIAS: 'plu.tienda',
  PAYMENT_TRANSFER_CBU: '0000003100000000000001',
  PAYMENT_TRANSFER_HOLDER: 'PLU Argentina',
}

const pendingOrder = (overrides = {}) => ({
  id: ORDER_ID,
  reference: 'TND-AB3K9Z',
  status: 'pendiente',
  paymentMethod: 'cash_on_site',
  amount: 48000,
  currency: 'ARS',
  buyerName: 'Lucía Pérez',
  buyerEmail: 'lucia@example.com',
  buyerPhone: '1155',
  buyerNote: 'nota interna del comprador',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  items: [
    {
      productId: PRODUCT_ID,
      title: 'Buzo Pitbull',
      category: 'apparel',
      sizeLabel: 'M',
      unitPrice: 48000,
      quantity: 1,
    },
  ],
  ...overrides,
})

function makeRepository(overrides = {}) {
  return {
    getSettings: vi.fn().mockResolvedValue(baseSettings),
    getBankProfile: vi.fn().mockResolvedValue(null),
    createOrder: vi.fn().mockResolvedValue({ order: pendingOrder(), accessToken: TOKEN }),
    expireOrders: vi.fn().mockResolvedValue({ expired: 0 }),
    getBuyerOrder: vi.fn().mockResolvedValue(pendingOrder()),
    assertBuyerAccess: vi.fn().mockResolvedValue({}),
    getOrderForPayment: vi.fn().mockResolvedValue({
      id: ORDER_ID,
      kind: 'shop',
      reference: 'TND-AB3K9Z',
      status: 'pendiente',
      method: 'mercado_pago',
      amount: 48000,
      currency: 'ARS',
      payerEmail: 'lucia@example.com',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      mercadoPagoProfileId: null,
    }),
    savePreference: vi.fn().mockResolvedValue(undefined),
    applyMercadoPagoPayment: vi.fn().mockImplementation(async ({ status }) => ({
      outcome: status === 'approved' ? 'approved' : 'not_approved',
      order: pendingOrder({
        paymentMethod: 'mercado_pago',
        status: status === 'approved' ? 'aprobado' : 'pendiente',
      }),
    })),
    listAdminOrders: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function makeMercadoPago(payment = null) {
  return {
    createPreference: vi
      .fn()
      .mockResolvedValue({ id: 'pref-1', initPoint: 'https://mp.test/checkout/pref-1' }),
    getPayment: vi.fn().mockResolvedValue(payment),
    findPaymentForOrder: vi.fn().mockResolvedValue(payment),
  }
}

const approvedPayment = (overrides = {}) => ({
  id: 1234567,
  status: 'approved',
  external_reference: ORDER_ID,
  transaction_amount: 48000,
  currency_id: 'ARS',
  ...overrides,
})

async function withApp(deps, run) {
  const brevo = { configured: true, send: vi.fn().mockResolvedValue({ id: 'm1' }) }
  const target = listen(
    createApp({
      env,
      brevo,
      platformSettingsRepository: { get: async () => ({ checkoutEnabled: true }) },
      shopWebhookSecrets: [{ secret: SECRET, profileId: null }],
      ...deps,
    }),
  )
  try {
    await run(target, brevo)
  } finally {
    await target.close()
  }
}

const post = (target, path, body, headers = {}) =>
  fetch(`${target.url}/api/shop${path}`, {
    method: 'POST',
    headers: { ...mutationHeaders, ...headers },
    body: JSON.stringify(body),
  })

const validOrder = (paymentMethod = 'cash_on_site') => ({
  items: [{ productId: PRODUCT_ID, sizeLabel: 'M', quantity: 1 }],
  buyer: { name: 'Lucía Pérez', email: 'lucia@example.com', phone: '1155', note: 'nota' },
  paymentMethod,
})

describe('opciones de cobro de la tienda', () => {
  const settings = baseSettings
  const profile = { config: { alias: 'perfil.alias', cbu: '', holder: 'Titular' } }

  it('ofrece solo los medios abiertos y con destino de cobro', () => {
    const options = resolveShopCheckoutOptions({ settings, toggles: {}, bankProfile: null, env })
    expect(options.methods).toEqual({ mercado_pago: true, bank_transfer: true, cash_on_site: true })
    expect(options.bankDetails.alias).toBe('plu.tienda')
  })

  it('sin alias ni CBU no ofrece transferencia, aunque esté prendida', () => {
    const options = resolveShopCheckoutOptions({
      settings,
      toggles: {},
      env: { ...env, PAYMENT_TRANSFER_ALIAS: '', PAYMENT_TRANSFER_CBU: '' },
    })
    expect(options.methods.bank_transfer).toBe(false)
    expect(options.bankDetails).toBeNull()
  })

  it('el perfil bancario de la tienda manda sobre el entorno', () => {
    const options = resolveShopCheckoutOptions({ settings, toggles: {}, bankProfile: profile, env })
    expect(options.bankDetails.alias).toBe('perfil.alias')
  })

  it('el interruptor general de cobros cierra todo', () => {
    const options = resolveShopCheckoutOptions({
      settings,
      toggles: { checkoutEnabled: false },
      env,
    })
    expect(options.open).toBe(false)
    expect(Object.values(options.methods).some(Boolean)).toBe(false)
    expect(() => assertShopMethodOpen(options, 'cash_on_site')).toThrow(/no está cobrando/)
  })

  it('el comprador no recibe los datos bancarios de un pedido que no es de transferencia', () => {
    const options = resolveShopCheckoutOptions({ settings, toggles: {}, env })
    const cash = toBuyerOrderView(pendingOrder(), options)
    expect(cash.payment.bankDetails).toBeNull()
    expect(cash.payment.cashInstructions).toContain('Banfield')
    expect(cash.buyerNote).toBeUndefined()
    const transfer = toBuyerOrderView(pendingOrder({ paymentMethod: 'bank_transfer' }), options)
    expect(transfer.payment.bankDetails.alias).toBe('plu.tienda')
    const paid = toBuyerOrderView(
      pendingOrder({ paymentMethod: 'bank_transfer', status: 'aprobado' }),
      options,
    )
    expect(paid.payment.bankDetails).toBeNull()
  })
})

describe('validación de un pago contra su pedido', () => {
  const order = { id: ORDER_ID, amount: 48000, currency: 'ARS' }

  it('acepta el pago del pedido con su monto y moneda', () => {
    expect(() => assertShopPaymentMatchesOrder(approvedPayment(), order)).not.toThrow()
  })

  it.each([
    ['otra referencia', { external_reference: 'otro-pedido' }],
    ['otro monto', { transaction_amount: 1 }],
    ['otra moneda', { currency_id: 'USD' }],
  ])('rechaza un pago con %s', (_label, patch) => {
    expect(() => assertShopPaymentMatchesOrder(approvedPayment(patch), order)).toThrow()
  })
})

describe('GET /api/shop/checkout', () => {
  it('informa medios abiertos sin exponer datos bancarios y sin cachear', async () => {
    await withApp({ shopOrderRepository: makeRepository() }, async (target) => {
      const response = await fetch(`${target.url}/api/shop/checkout`)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toMatch(/no-store/)
      expect(body.methods).toEqual({ mercado_pago: true, bank_transfer: true, cash_on_site: true })
      expect(JSON.stringify(body)).not.toContain('0000003100000000000001')
    })
  })
})

describe('POST /api/shop/orders', () => {
  it('crea el pedido, devuelve el token una vez y avisa por mail las instrucciones de efectivo', async () => {
    const repository = makeRepository()
    await withApp({ shopOrderRepository: repository }, async (target, brevo) => {
      const response = await post(target, '/orders', validOrder('cash_on_site'))
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.accessToken).toBe(TOKEN)
      expect(body.order.reference).toBe('TND-AB3K9Z')
      expect(body.order.payment.cashInstructions).toContain('Banfield')
      expect(repository.expireOrders).toHaveBeenCalled()
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'cash_on_site', holdMinutes: 72 * 60 }),
      )
      await vi.waitFor(() => expect(brevo.send).toHaveBeenCalled())
    })
  })

  it('el precio no se manda: el cliente solo elige producto, talle y cantidad', async () => {
    const repository = makeRepository()
    await withApp({ shopOrderRepository: repository }, async (target) => {
      await post(target, '/orders', {
        ...validOrder(),
        items: [{ productId: PRODUCT_ID, sizeLabel: 'M', quantity: 1, unitPrice: 1, price: 1 }],
        amount: 1,
      })
      const sent = repository.createOrder.mock.calls[0][0]
      expect(JSON.stringify(sent)).not.toMatch(/"(unitPrice|price|amount)"/)
    })
  })

  it('rechaza un medio cerrado por el panel sin reservar stock', async () => {
    const repository = makeRepository({
      getSettings: vi.fn().mockResolvedValue({ ...baseSettings, cashEnabled: false }),
    })
    await withApp({ shopOrderRepository: repository }, async (target) => {
      const response = await post(target, '/orders', validOrder('cash_on_site'))
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe('SHOP_METHOD_DISABLED')
      expect(repository.createOrder).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['sin productos', { items: [] }],
    ['cantidad inválida', { items: [{ productId: PRODUCT_ID, quantity: 11 }] }],
    ['producto inválido', { items: [{ productId: 'x', quantity: 1 }] }],
    ['mail inválido', { buyer: { name: 'Ana', email: 'no-es-mail' } }],
    ['medio inventado', { paymentMethod: 'bitcoin' }],
  ])('valida el pedido: %s', async (_label, patch) => {
    const repository = makeRepository()
    await withApp({ shopOrderRepository: repository }, async (target) => {
      const response = await post(target, '/orders', { ...validOrder(), ...patch })
      expect(response.status).toBe(400)
      expect(repository.createOrder).not.toHaveBeenCalled()
    })
  })
})

describe('pago con Mercado Pago', () => {
  it('crea la preferencia apuntando al webhook de la tienda y guarda su id', async () => {
    const repository = makeRepository()
    const mercadoPago = makeMercadoPago()
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: mercadoPago },
      async (target) => {
        const response = await post(target, `/orders/${ORDER_ID}/pay`, { accessToken: TOKEN })
        const body = await response.json()

        expect(response.status).toBe(201)
        expect(body.initPoint).toBe('https://mp.test/checkout/pref-1')
        const call = mercadoPago.createPreference.mock.calls[0][0]
        expect(call.order).toMatchObject({
          kind: 'shop',
          amount: 48000,
          notificationPath: '/api/shop/webhook/mercadopago',
        })
        expect(call.idempotencyKey).toBe(`shop-pref-${ORDER_ID}`)
        expect(repository.savePreference).toHaveBeenCalledWith(ORDER_ID, 'pref-1')
      },
    )
  })

  it('no cobra un pedido vencido ni uno que no es de Mercado Pago', async () => {
    const mercadoPago = makeMercadoPago()
    const expired = makeRepository({
      getOrderForPayment: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        kind: 'shop',
        status: 'pendiente',
        method: 'mercado_pago',
        amount: 1,
        currency: 'ARS',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    })
    await withApp(
      { shopOrderRepository: expired, shopMercadoPago: mercadoPago },
      async (target) => {
        const response = await post(target, `/orders/${ORDER_ID}/pay`, { accessToken: TOKEN })
        expect(response.status).toBe(409)
        expect((await response.json()).code).toBe('SHOP_ORDER_EXPIRED')
      },
    )

    const cash = makeRepository({
      getOrderForPayment: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        kind: 'shop',
        status: 'pendiente',
        method: 'cash_on_site',
        amount: 1,
        currency: 'ARS',
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      }),
    })
    await withApp({ shopOrderRepository: cash, shopMercadoPago: mercadoPago }, async (target) => {
      expect((await post(target, `/orders/${ORDER_ID}/pay`, { accessToken: TOKEN })).status).toBe(
        400,
      )
    })
    expect(mercadoPago.createPreference).not.toHaveBeenCalled()
  })

  it('al volver, acredita lo que dice la API —no la URL— y manda el mail de pago', async () => {
    const repository = makeRepository()
    const mercadoPago = makeMercadoPago(approvedPayment())
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: mercadoPago },
      async (target, brevo) => {
        const response = await post(target, `/orders/${ORDER_ID}/reconcile`, {
          accessToken: TOKEN,
          paymentId: '1234567',
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.outcome).toBe('approved')
        expect(mercadoPago.getPayment).toHaveBeenCalledWith('1234567')
        expect(repository.applyMercadoPagoPayment).toHaveBeenCalledWith({
          orderId: ORDER_ID,
          paymentId: 1234567,
          status: 'approved',
          amount: 48000,
          currency: 'ARS',
        })
        await vi.waitFor(() => expect(brevo.send).toHaveBeenCalled())
      },
    )
  })

  it('un payment_id de otro pedido o con otro monto no acredita nada', async () => {
    for (const payment of [
      approvedPayment({ external_reference: '00000000-0000-4000-8000-000000000000' }),
      approvedPayment({ transaction_amount: 10 }),
    ]) {
      const repository = makeRepository()
      await withApp(
        { shopOrderRepository: repository, shopMercadoPago: makeMercadoPago(payment) },
        async (target) => {
          const response = await post(target, `/orders/${ORDER_ID}/reconcile`, {
            accessToken: TOKEN,
            paymentId: '1',
          })
          expect(response.status).toBe(409)
          expect(repository.applyMercadoPagoPayment).not.toHaveBeenCalled()
        },
      )
    }
  })

  it('sin pago todavía responde 202 con el pedido', async () => {
    await withApp(
      { shopOrderRepository: makeRepository(), shopMercadoPago: makeMercadoPago(null) },
      async (target) => {
        const response = await post(target, `/orders/${ORDER_ID}/reconcile`, { accessToken: TOKEN })
        expect(response.status).toBe(202)
        expect((await response.json()).reconciled).toBe(false)
      },
    )
  })
})

describe('webhook de Mercado Pago de la tienda', () => {
  const signedHeaders = (dataId, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) => {
    const requestId = 'req-1'
    const hash = createHmac('sha256', secret)
      .update(`id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`)
      .digest('hex')
    return { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${hash}` }
  }
  const hook = (target, query, headers = {}, body = { type: 'payment', data: { id: '1234567' } }) =>
    fetch(`${target.url}/api/shop/webhook/mercadopago?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  it('con firma válida acredita el pago contra su pedido', async () => {
    const repository = makeRepository()
    const mercadoPago = makeMercadoPago(approvedPayment())
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: mercadoPago },
      async (target) => {
        const response = await hook(
          target,
          'type=payment&data.id=1234567',
          signedHeaders('1234567'),
        )
        expect(response.status).toBe(200)
        expect((await response.json()).outcome).toBe('approved')
        expect(repository.applyMercadoPagoPayment).toHaveBeenCalledTimes(1)
      },
    )
  })

  it('con firma inválida rechaza sin consultar a Mercado Pago ni tocar el pedido', async () => {
    const repository = makeRepository()
    const mercadoPago = makeMercadoPago(approvedPayment())
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: mercadoPago },
      async (target) => {
        const response = await hook(
          target,
          'type=payment&data.id=1234567',
          signedHeaders('1234567', { secret: 'otro-secreto' }),
        )
        expect(response.status).toBe(401)
        expect(mercadoPago.getPayment).not.toHaveBeenCalled()
        expect(repository.applyMercadoPagoPayment).not.toHaveBeenCalled()
      },
    )
  })

  it('una firma vieja (fuera de tolerancia) se rechaza', async () => {
    await withApp(
      {
        shopOrderRepository: makeRepository(),
        shopMercadoPago: makeMercadoPago(approvedPayment()),
      },
      async (target) => {
        const response = await hook(
          target,
          'type=payment&data.id=1234567',
          signedHeaders('1234567', { ts: Math.floor(Date.now() / 1000) - 3600 }),
        )
        expect(response.status).toBe(401)
      },
    )
  })

  it('la IPN sin firma acredita solo si la API confirma el pago de ese pedido', async () => {
    const repository = makeRepository()
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: makeMercadoPago(approvedPayment()) },
      async (target) => {
        const response = await hook(target, 'topic=payment&id=1234567', {}, {})
        expect(response.status).toBe(200)
        expect(repository.applyMercadoPagoPayment).toHaveBeenCalledTimes(1)
      },
    )
  })

  it('una IPN con un pago de monto distinto se descarta con 200 para cortar el reintento', async () => {
    const repository = makeRepository()
    await withApp(
      {
        shopOrderRepository: repository,
        shopMercadoPago: makeMercadoPago(approvedPayment({ transaction_amount: 5 })),
      },
      async (target) => {
        const response = await hook(target, 'topic=payment&id=1234567', {}, {})
        expect(response.status).toBe(200)
        expect((await response.json()).reason).toBe('payment_mismatch')
        expect(repository.applyMercadoPagoPayment).not.toHaveBeenCalled()
      },
    )
  })

  it('un pago que no es de la tienda se ignora sin error', async () => {
    const repository = makeRepository({
      getOrderForPayment: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('no'), { status: 404 })),
    })
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: makeMercadoPago(approvedPayment()) },
      async (target) => {
        const response = await hook(target, 'topic=payment&id=1', {}, {})
        expect(response.status).toBe(200)
        expect((await response.json()).reason).toBe('unknown_order')
      },
    )
  })

  it('las notificaciones que no son pagos (merchant_order) se descartan con 200', async () => {
    const repository = makeRepository()
    const mercadoPago = makeMercadoPago(approvedPayment())
    await withApp(
      { shopOrderRepository: repository, shopMercadoPago: mercadoPago },
      async (target) => {
        const response = await hook(target, 'topic=merchant_order&id=99', {}, {})
        expect(response.status).toBe(200)
        expect(mercadoPago.getPayment).not.toHaveBeenCalled()
      },
    )
  })
})

describe('transferencia y comprobante', () => {
  it('prepara la subida con el token y registra el comprobante', async () => {
    const repository = makeRepository({
      createProofUpload: vi.fn().mockResolvedValue({ path: `${ORDER_ID}/1-p.png`, token: 't' }),
      registerProof: vi.fn().mockResolvedValue(pendingOrder({ paymentMethod: 'bank_transfer' })),
    })
    await withApp({ shopOrderRepository: repository }, async (target) => {
      const upload = await post(target, `/orders/${ORDER_ID}/proof-upload`, {
        accessToken: TOKEN,
        fileName: 'p.png',
        contentType: 'image/png',
        size: 1000,
      })
      expect(upload.status).toBe(200)
      expect(repository.createProofUpload).toHaveBeenCalledWith(ORDER_ID, TOKEN, 'p.png')

      const proof = await post(target, `/orders/${ORDER_ID}/proof`, {
        accessToken: TOKEN,
        proofPath: `${ORDER_ID}/1-p.png`,
      })
      expect(proof.status).toBe(200)
    })
  })

  it('rechaza archivos de más de 2 MB o de tipo no permitido', async () => {
    const repository = makeRepository({ createProofUpload: vi.fn() })
    await withApp({ shopOrderRepository: repository }, async (target) => {
      const big = await post(target, `/orders/${ORDER_ID}/proof-upload`, {
        accessToken: TOKEN,
        fileName: 'p.png',
        contentType: 'image/png',
        size: 3 * 1024 * 1024,
      })
      const exe = await post(target, `/orders/${ORDER_ID}/proof-upload`, {
        accessToken: TOKEN,
        fileName: 'p.exe',
        contentType: 'application/x-msdownload',
        size: 10,
      })
      expect([big.status, exe.status]).toEqual([400, 400])
      expect(repository.createProofUpload).not.toHaveBeenCalled()
    })
  })
})

describe('pedido del comprador', () => {
  it('sin token no se ve el pedido', async () => {
    const repository = makeRepository({
      getBuyerOrder: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Falta el token'), { status: 401 })),
    })
    await withApp({ shopOrderRepository: repository }, async (target) => {
      const response = await fetch(`${target.url}/api/shop/orders/${ORDER_ID}`)
      expect(response.status).toBe(401)
    })
  })

  it('con token devuelve el pedido sin datos internos y sin cachear', async () => {
    await withApp({ shopOrderRepository: makeRepository() }, async (target) => {
      const response = await fetch(`${target.url}/api/shop/orders/${ORDER_ID}`, {
        headers: { 'x-order-access-token': TOKEN },
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toMatch(/no-store/)
      expect(body.order.buyerNote).toBeUndefined()
      expect(body.order.reference).toBe('TND-AB3K9Z')
    })
  })
})

describe('administración de pedidos', () => {
  it('toda ruta del panel exige sesión', async () => {
    await withApp({ shopOrderRepository: makeRepository() }, async (target) => {
      const statuses = (
        await Promise.all([
          fetch(`${target.url}/api/shop/admin/orders`),
          fetch(`${target.url}/api/shop/admin/checkout-settings`),
          post(target, `/admin/orders/${ORDER_ID}/approve`, {}),
          post(target, `/admin/orders/${ORDER_ID}/cancel`, {}),
          post(target, `/admin/orders/${ORDER_ID}/fulfill`, {}),
          fetch(`${target.url}/api/shop/admin/orders/${ORDER_ID}/proof-url`),
          fetch(`${target.url}/api/shop/admin/checkout-settings`, {
            method: 'PATCH',
            headers: mutationHeaders,
            body: JSON.stringify({
              mercadoPagoEnabled: true,
              bankTransferEnabled: true,
              cashEnabled: true,
            }),
          }),
        ])
      ).map((response) => response.status)
      expect(statuses.every((status) => status === 401)).toBe(true)
    })
  })
})
