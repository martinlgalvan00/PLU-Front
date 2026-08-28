import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { processPaymentWebhook } from '../server/modules/payments/paymentWorkflow.js'

const WEBHOOK_SECRET = 'secreto-para-tests'

/** Firma real sobre el manifiesto `id:…;request-id:…;ts:…;`, ts en segundos. */
function validSignature(dataId, requestId, ts = Math.floor(Date.now() / 1000)) {
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

/**
 * El formato IPN de Mercado Pago (`?topic=payment&id=123`, sin `x-signature`).
 *
 * Producción lo estuvo rechazando entero: `payment_integration_events` quedó
 * vacía y cada acreditación dependía de que el atleta volviera del checkout con
 * la pestaña abierta. El que pagaba en efectivo, por transferencia desde MP o
 * cerraba el navegador se quedaba con la orden en `pendiente` hasta que el cron
 * la cancelaba, con la plata ya adentro. 216 notificaciones rebotaron por esto
 * en un solo día.
 *
 * Lo que fija este archivo es que aceptarlas no baja la guardia: el payload no
 * decide nada, el pago se relee de la API de Mercado Pago y se revalida contra
 * la orden igual que en el camino firmado.
 */

const ORDER_ID = '5f1cd6a2-0f37-4b6f-8b30-2a1a7a2b1e55'

function order(overrides = {}) {
  return {
    id: ORDER_ID,
    athlete_id: 'ath-1',
    concept: 'registration',
    amount: 85_000,
    currency: 'ARS',
    status: 'pendiente',
    ...overrides,
  }
}

function providerPayment(overrides = {}) {
  return {
    id: 175951629312,
    external_reference: ORDER_ID,
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 85_000,
    currency_id: 'ARS',
    payer: { email: 'atleta@example.com' },
    ...overrides,
  }
}

function harness({ payment = providerPayment(), orderRow = order() } = {}) {
  const recorded = []
  const repository = {
    recordWebhook: vi.fn(async (input) => {
      recorded.push(input)
      return {
        created: true,
        event: {
          id: 'event-1',
          status: 'received',
          resource_id: input.resourceId,
          event_type: input.type,
          attempts_count: 0,
        },
      }
    }),
    claimWebhookEvent: vi.fn(async (id) => ({
      id,
      status: 'processing',
      resource_id: String(payment.id),
      event_type: 'payment',
      attempts_count: 0,
    })),
    markWebhookProcessed: vi.fn(async (id, result) => ({ id, status: 'processed', result })),
    markWebhookFailed: vi.fn(async () => ({})),
    getOrder: vi.fn(async () => orderRow),
    applyPayment: vi.fn(async () => ({ order: { ...orderRow, status: 'aprobado' } })),
  }
  const mercadoPago = { getPayment: vi.fn(async () => payment) }
  return { repository, mercadoPago, recorded }
}

describe('webhook de Mercado Pago en formato IPN', () => {
  it('acredita una notificacion sin firma releyendo el pago del proveedor', async () => {
    const { repository, mercadoPago } = harness()

    const result = await processPaymentWebhook(
      { body: {}, query: { topic: 'payment', id: '175951629312' }, headers: {} },
      { repository, mercadoPago, webhookSecret: 'no-se-usa-en-ipn' },
    )

    // El id de la query es sólo el disparador: lo que decide es la respuesta de
    // la API de Mercado Pago.
    expect(mercadoPago.getPayment).toHaveBeenCalledWith('175951629312')
    expect(repository.applyPayment).toHaveBeenCalledTimes(1)
    expect(result.duplicate).toBe(false)
  })

  it('asienta que el evento no venia firmado', async () => {
    const { repository, mercadoPago, recorded } = harness()

    await processPaymentWebhook(
      { body: {}, query: { topic: 'payment', id: '175951629312' }, headers: {} },
      { repository, mercadoPago, webhookSecret: 'x' },
    )

    expect(recorded[0].signatureValid).toBe(false)
    // La clave de idempotencia no puede salir del body: la IPN lo manda vacío.
    expect(recorded[0].notificationId).toBe('ipn:payment:175951629312')
  })

  it('dos avisos del mismo pago colapsan en una sola fila', async () => {
    const { repository, mercadoPago } = harness()
    const notification = {
      body: {},
      query: { topic: 'payment', id: '175951629312' },
      headers: {},
    }

    await processPaymentWebhook(notification, { repository, mercadoPago, webhookSecret: 'x' })
    await processPaymentWebhook(notification, { repository, mercadoPago, webhookSecret: 'x' })

    const [first, second] = repository.recordWebhook.mock.calls
    expect(first[0].notificationId).toBe(second[0].notificationId)
  })

  it('rechaza un pago que no pertenece a la orden informada', async () => {
    // El escenario que justifica aceptar la IPN sin firma: aunque un tercero
    // postee el id de un pago ajeno, la validación contra la orden lo mata.
    const { repository, mercadoPago } = harness({
      payment: providerPayment({ external_reference: 'otra-orden' }),
    })

    await expect(
      processPaymentWebhook(
        { body: {}, query: { topic: 'payment', id: '175951629312' }, headers: {} },
        { repository, mercadoPago, webhookSecret: 'x' },
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect(repository.applyPayment).not.toHaveBeenCalled()
  })

  it('descarta merchant_order sin tocar el ledger y CONFIRMANDO la entrega', async () => {
    // La orden comercial no es el cobro: el pago que la compone llega por su
    // propia notificación. Procesarla acreditaría dos veces lo mismo.
    //
    // Y el descarte responde 200, no 400: para Mercado Pago un 4xx es una
    // entrega fallida que reintenta con backoff — cada checkout genera su
    // merchant_order, así que rechazarla llenaba la bitácora de "errores" que
    // no eran errores y hacía reintentar N veces algo que jamás se iba a
    // procesar.
    const { repository, mercadoPago } = harness()

    const result = await processPaymentWebhook(
      { body: {}, query: { topic: 'merchant_order', id: '43954117155' }, headers: {} },
      { repository, mercadoPago, webhookSecret: 'x' },
    )

    expect(result).toMatchObject({ accepted: true, ignored: true, reason: 'unsupported_type' })
    expect(repository.recordWebhook).not.toHaveBeenCalled()
    expect(repository.applyPayment).not.toHaveBeenCalled()
    expect(mercadoPago.getPayment).not.toHaveBeenCalled()
  })

  it('un type de Webhooks no procesable también se confirma y se ignora', async () => {
    // Mismo criterio para el formato firmado: un topic al que la aplicación de
    // MP esté suscripta de más (plan, invoice, point_integration_wh) no es una
    // falla nuestra — se confirma la entrega y no se toca nada.
    const { repository, mercadoPago } = harness()

    const result = await processPaymentWebhook(
      {
        body: { id: 9, type: 'point_integration_wh', data: { id: 'pi-1' } },
        query: { 'data.id': 'pi-1', type: 'point_integration_wh' },
        headers: { 'x-signature': validSignature('pi-1', 'req-9'), 'x-request-id': 'req-9' },
      },
      { repository, mercadoPago, webhookSecret: WEBHOOK_SECRET, toleranceSeconds: 300 },
    )

    expect(result).toMatchObject({ accepted: true, ignored: true, reason: 'unsupported_type' })
    expect(repository.recordWebhook).not.toHaveBeenCalled()
  })

  it('el camino firmado sigue exigiendo firma valida', async () => {
    const { repository, mercadoPago } = harness()

    await expect(
      processPaymentWebhook(
        {
          body: { id: 1, type: 'payment', data: { id: '175951629312' } },
          query: { 'data.id': '175951629312', type: 'payment' },
          headers: { 'x-signature': 'ts=1,v1=' + '0'.repeat(64), 'x-request-id': 'req-1' },
        },
        { repository, mercadoPago, webhookSecret: 'secreto', toleranceSeconds: 300 },
      ),
    ).rejects.toMatchObject({ status: 401 })
    expect(repository.recordWebhook).not.toHaveBeenCalled()
  })

  it('una notificacion sin data.id ni topic sigue siendo un rechazo', async () => {
    const { repository, mercadoPago } = harness()

    await expect(
      processPaymentWebhook(
        { body: { id: 1 }, query: {}, headers: {} },
        { repository, mercadoPago, webhookSecret: 'x' },
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(repository.recordWebhook).not.toHaveBeenCalled()
  })
})
