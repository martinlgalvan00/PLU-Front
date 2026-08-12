import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { createSupabasePaymentRepository } from '../server/modules/payments/supabasePaymentRepository.js'

const rateLimits = readFileSync(resolve(process.cwd(), 'server/middleware/rateLimit.js'), 'utf8')
const paymentRoutes = readFileSync(resolve(process.cwd(), 'server/routes/payments.js'), 'utf8')

const ORDER_ID = '8cb43d94-b330-4e69-a2d0-76a56916ebf5'
const ACCESS_TOKEN = 'test-order-access-token-with-enough-entropy'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function ticketOrder() {
  return {
    id: ORDER_ID,
    kind: 'ticket',
    athleteId: null,
    amount: 25000,
    currency: 'ARS',
    displayConcept: 'Entradas Pitbull Classic',
    method: 'mercado_pago',
    status: 'pendiente',
    payerEmail: 'comprador@example.com',
  }
}

/**
 * Cliente Supabase de mentira que contabiliza cada tabla consultada y cada RPC.
 * Alcanza para distinguir "el repositorio releyó la orden" de "usó la que ya
 * venía resuelta", que es justo lo que fija este archivo.
 */
function stubClient({ row = { id: ORDER_ID } } = {}) {
  const calls = { from: [], rpc: [] }
  const client = {
    calls,
    from(table) {
      calls.from.push(table)
      const chain = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        single: async () => ({ data: row, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return chain
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args })
      return { data: { ok: true }, error: null }
    },
  }
  return client
}

describe('telemetría del Brick separada del cupo de checkout', () => {
  it('tiene limiter propio y no gasta los intentos de pago', () => {
    // `/telemetry` se dispara justo cuando el checkout falla. Compartiendo
    // `checkoutLimiter` con /preferences y /embedded/process, cada error de
    // render consumía cupo de pago: el atleta agotaba el límite reportando el
    // problema y recibía "Demasiados intentos de checkout" sin haber llegado a
    // enviar un pago. Mismo bug que ya se corrigió en el login de atleta.
    expect(rateLimits).toContain('export const paymentTelemetryLimiter')
    expect(paymentRoutes).toContain("router.post('/telemetry', paymentTelemetryLimiter")

    // El resto del checkout sí comparte cupo a propósito.
    expect(paymentRoutes).toContain("router.post('/preferences', checkoutLimiter")
    expect(paymentRoutes).toContain("router.post('/embedded/process', checkoutLimiter")
  })
})

describe('la orden se resuelve una sola vez por pago', () => {
  it('el checkout embebido reusa la orden que ya validó el control de acceso', async () => {
    const repository = {
      getOrder: vi.fn(async () => ticketOrder()),
      assertTicketOrderAccess: vi.fn(async () => ({ id: ORDER_ID })),
      claimEmbeddedAttempt: vi.fn(async () => ({
        created: true,
        attempt: { id: 'attempt-1', idempotency_key: 'server-key' },
      })),
      completeEmbeddedAttempt: vi.fn(async () => undefined),
      applyPayment: vi.fn(async () => ({ order: { id: ORDER_ID, status: 'aprobado' } })),
    }
    const mercadoPago = {
      createPayment: vi.fn(async ({ order, formData }) => ({
        id: 'mp-1',
        status: 'approved',
        status_detail: 'accredited',
        transaction_amount: order.amount,
        currency_id: order.currency,
        external_reference: order.id,
        payment_method_id: formData.payment_method_id,
        payer: { email: formData.payer.email },
      })),
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
        orderAccessToken: ACCESS_TOKEN,
        formData: {
          token: 'temporary-card-token',
          payment_method_id: 'visa',
          installments: 1,
          payer: { email: 'comprador@example.com' },
        },
      }),
    })
    await target.close()

    expect(response.status).toBe(201)
    // Antes: una lectura en requireOrderAccess, otra en processEmbeddedPayment
    // y una tercera dentro de applyPayment. Cada una con sus joins, y en las
    // órdenes de entradas duplicada porque getOrder sondea athletes primero.
    expect(repository.getOrder).toHaveBeenCalledOnce()
    // El tipo viaja con el pago para que el repositorio no tenga que releerlo.
    expect(repository.applyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, orderKind: 'ticket' }),
    )
  })

  it('vuelve a leer la orden si el llamador pasa una que no corresponde', async () => {
    // La reutilización nunca puede desalinear la orden del body: si no coincide
    // el id, gana la lectura autoritativa.
    const { processEmbeddedPayment } = await import(
      '../server/modules/payments/embeddedPaymentWorkflow.js'
    )
    const repository = {
      getOrder: vi.fn(async () => ({ ...ticketOrder(), status: 'aprobado' })),
      claimEmbeddedAttempt: vi.fn(),
    }

    const result = await processEmbeddedPayment(
      { paymentOrderId: ORDER_ID, formData: { payment_method_id: 'visa', payer: {} } },
      { repository, mercadoPago: {}, order: { id: 'otra-orden', kind: 'athlete', status: 'pendiente' } },
    )

    expect(repository.getOrder).toHaveBeenCalledWith(ORDER_ID)
    expect(result.duplicate).toBe(true)
    expect(repository.claimEmbeddedAttempt).not.toHaveBeenCalled()
  })
})

describe('repositorio de pagos: sin relecturas de descarte', () => {
  it('aplica el pago eligiendo la RPC por el tipo que le pasan', async () => {
    const client = stubClient()
    const repository = createSupabasePaymentRepository(client)

    await repository.applyPayment({
      orderId: ORDER_ID,
      orderKind: 'ticket',
      externalPaymentId: 'mp-1',
      status: 'aprobado',
      amount: 25000,
      currency: 'ARS',
      payerEmail: 'comprador@example.com',
      statusDetail: 'accredited',
      raw: {},
    })

    expect(client.calls.from).toEqual([])
    expect(client.calls.rpc.map((call) => call.name)).toEqual(['apply_ticket_mercado_pago_payment'])
  })

  it('guarda la preferencia en la tabla del tipo recibido, sin sondear', async () => {
    const client = stubClient()
    const repository = createSupabasePaymentRepository(client)

    await repository.attachPreference(
      ORDER_ID,
      { id: 'pref-1', initPoint: 'https://mp.example/pay', raw: {} },
      'idem-key',
      'ticket',
    )

    expect(client.calls.from).toEqual(['ticket_orders'])
  })

  it('sigue resolviendo el tipo por su cuenta si no se lo pasan', async () => {
    // Contrato preservado para cualquier llamador viejo: el fallback lee la
    // orden y, al no encontrarla en ninguna tabla, falla cerrado.
    const client = stubClient()
    const repository = createSupabasePaymentRepository(client)

    await expect(
      repository.applyPayment({ orderId: ORDER_ID, externalPaymentId: 'mp-1', status: 'aprobado' }),
    ).rejects.toMatchObject({ status: 404 })

    expect(client.calls.from).toEqual(['athlete_payment_orders', 'ticket_orders'])
    expect(client.calls.rpc).toEqual([])
  })
})
