import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Webhook de Mercado Pago, de la firma al derecho otorgado, contra la base real.
 *
 * Los tests unitarios de webhook usan un repositorio doble: prueban el
 * workflow, no el efecto. Lo que decide si un socio queda afiliado es la RPC
 * `apply_mercado_pago_payment` -- el agregado del estado de la orden sobre
 * todas sus filas de pago, la activacion de la membresia, el cambio de estado
 * del atleta -- y eso solo se puede verificar con Postgres del otro lado.
 *
 * Cubre las cuatro propiedades que sostienen el cobro:
 *   1. firma valida -> acredita y activa la membresia;
 *   2. firma invalida -> 401 y la orden no se mueve;
 *   3. notificacion repetida -> no duplica el pago ni el derecho;
 *   4. monto que no coincide -> no acredita (el proveedor no puede cambiar el
 *      precio de la orden).
 */

const admin = createSupabaseTestClient()
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
const WEBHOOK_SECRET = 'plu-integration-webhook-secret'
const AMOUNT = 85_000

let target
let athleteId
let orderId
let membershipId
let paymentId

/**
 * Manifiesto y firma tal como los arma Mercado Pago: `ts=<ts>,v1=<hmac>` sobre
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 *
 * `ts` va en **milisegundos**: el validador del SDK compara
 * `Math.abs(Date.now() - Number(ts)) / 1000` contra la tolerancia, asi que
 * firmarlo en segundos da una deriva de decadas y rebota por timestamp, no por
 * firma.
 */
function signedHeaders(dataId, requestId = randomUUID()) {
  const ts = Date.now()
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex')
  return {
    'Content-Type': 'application/json',
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': requestId,
  }
}

function providerPayment(overrides = {}) {
  return {
    id: paymentId,
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: AMOUNT,
    currency_id: 'ARS',
    external_reference: orderId,
    date_created: new Date().toISOString(),
    date_approved: new Date().toISOString(),
    payer: { email: 'webhook-integration@pluarg.test' },
    ...overrides,
  }
}

/** Doble del proveedor: la unica pieza que no se puede tocar de verdad. */
function mercadoPagoDouble(payment = providerPayment) {
  return {
    async getPayment(id) {
      const resolved = typeof payment === 'function' ? payment() : payment
      return { ...resolved, id: String(id) }
    },
    async searchPaymentsForOrder() {
      return [typeof payment === 'function' ? payment() : payment]
    },
  }
}

function notification(dataId) {
  return {
    id: Number(String(dataId).replace(/\D/g, '').slice(0, 9) || 1),
    type: 'payment',
    action: 'payment.updated',
    date_created: new Date().toISOString(),
    data: { id: String(dataId) },
  }
}

async function postWebhook(app, dataId, { headers, body } = {}) {
  return fetch(`${app.url}/api/payments/webhook/mercadopago?type=payment&data.id=${dataId}`, {
    method: 'POST',
    headers: headers ?? signedHeaders(dataId),
    body: JSON.stringify(body ?? notification(dataId)),
  })
}

async function readOrder() {
  const { data } = await admin
    .from('athlete_payment_orders')
    .select('status')
    .eq('id', orderId)
    .single()
  return data?.status
}

beforeAll(async () => {
  paymentId = `webhook-int-${randomUUID().slice(0, 12)}`

  const athlete = await admin
    .from('athletes')
    .insert({
      organization_id: ORGANIZATION_ID,
      full_name: 'Atleta Webhook',
      document_id: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
      email: `webhook-${randomUUID()}@pluarg.test`,
      birth_date: '1993-03-03',
      phone: '1122334455',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'La Plata',
      gym: 'Box Test',
      sex: 'Masculino',
      status: 'registrado',
    })
    .select('id')
    .single()
  if (athlete.error) throw new Error(athlete.error.message)
  athleteId = athlete.data.id

  const order = await admin
    .from('athlete_payment_orders')
    .insert({
      organization_id: ORGANIZATION_ID,
      athlete_id: athleteId,
      concept: 'membership',
      amount: AMOUNT,
      currency: 'ARS',
      method: 'mercado_pago',
      status: 'pendiente',
      reference: `WH-${randomUUID().slice(0, 8)}`,
      payer_email: 'webhook-integration@pluarg.test',
    })
    .select('id')
    .single()
  if (order.error) throw new Error(order.error.message)
  orderId = order.data.id

  const membership = await admin
    .from('memberships')
    .insert({
      organization_id: ORGANIZATION_ID,
      athlete_id: athleteId,
      year: String(new Date().getFullYear()),
      status: 'pendiente_pago',
      member_code: `WH-${randomUUID().slice(0, 8)}`,
      payment_order_id: orderId,
    })
    .select('id')
    .single()
  if (membership.error) throw new Error(membership.error.message)
  membershipId = membership.data.id

  target = listen(
    createApp({
      supabaseAdmin: admin,
      mercadoPago: mercadoPagoDouble(),
      // Sin notificaciones: el aviso por mail es best-effort y no es lo que
      // este test verifica.
      notifyPaymentApplied: async () => {},
      env: {
        ...process.env,
        APP_PRODUCTION: 'false',
        MERCADO_PAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
    }),
  )
})

afterAll(async () => {
  if (orderId) {
    await admin.from('operational_event_logs').delete().eq('entity_id', orderId)
    await admin.from('membership_cycles').delete().eq('order_id', orderId)
    await admin.from('athlete_payments').delete().eq('order_id', orderId)
  }
  if (membershipId) await admin.from('memberships').delete().eq('id', membershipId)
  if (orderId) await admin.from('athlete_payment_orders').delete().eq('id', orderId)
  if (athleteId) {
    await admin.from('operational_event_logs').delete().eq('actor_id', athleteId)
    await admin.from('athletes').delete().eq('id', athleteId)
  }
  await admin.from('payment_integration_events').delete().eq('resource_id', paymentId)
  // La firma invalida se rechaza antes de resolver la orden: el asiento de
  // auditoria queda con entity_id = paymentId, no orderId.
  await admin.from('operational_event_logs').delete().eq('entity_id', paymentId)
  await target?.close()
})

describe('webhook de Mercado Pago end-to-end', () => {
  it('rechaza una firma invalida y no toca la orden', async () => {
    const response = await postWebhook(target, paymentId, {
      headers: {
        'Content-Type': 'application/json',
        'x-signature': `ts=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`,
        'x-request-id': randomUUID(),
      },
    })

    expect(response.status).toBe(401)
    expect(await readOrder()).toBe('pendiente')
  })

  it('rechaza una notificacion sin data.id en la URL', async () => {
    // MP firma el data.id de la query, no el del cuerpo: aceptar el fallback
    // del body volveria ambiguo el manifiesto y la firma dejaria de probar nada.
    const response = await fetch(`${target.url}/api/payments/webhook/mercadopago?type=payment`, {
      method: 'POST',
      headers: signedHeaders(paymentId),
      body: JSON.stringify(notification(paymentId)),
    })

    expect(response.status).toBe(400)
    expect(await readOrder()).toBe('pendiente')
  })

  it('acredita el cobro y activa la afiliacion con firma valida', async () => {
    const response = await postWebhook(target, paymentId)
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.received).toBe(true)

    const [order, payment, membership, athlete] = await Promise.all([
      admin.from('athlete_payment_orders').select('status, approved_at').eq('id', orderId).single(),
      admin
        .from('athlete_payments')
        .select('status, amount, external_payment_id')
        .eq('order_id', orderId),
      admin.from('memberships').select('status').eq('id', membershipId).single(),
      admin.from('athletes').select('status').eq('id', athleteId).single(),
    ])

    expect(order.data.status).toBe('aprobado')
    expect(order.data.approved_at).toBeTruthy()
    expect(payment.data).toHaveLength(1)
    expect(payment.data[0]).toMatchObject({ status: 'aprobado', amount: AMOUNT })
    expect(membership.data.status).toBe('activa')
    expect(athlete.data.status).toBe('afiliado_activo')
  })

  it('la misma notificacion repetida no duplica el pago', async () => {
    // Mercado Pago reintenta hasta recibir 200. Sin idempotencia, cada reintento
    // sumaria una fila al ledger y el reporte financiero cobraria de mas.
    const response = await postWebhook(target, paymentId)
    expect(response.status).toBe(200)

    const payments = await admin.from('athlete_payments').select('id').eq('order_id', orderId)
    expect(payments.data).toHaveLength(1)

    const cycles = await admin.from('membership_cycles').select('id').eq('order_id', orderId)
    expect(cycles.data.length).toBeLessThanOrEqual(1)
  })

  it('no acredita un pago cuyo monto no coincide con la orden', async () => {
    // El precio lo fija la orden, no el proveedor: un pago por otro importe se
    // rechaza aunque venga firmado.
    const otherPaymentId = `webhook-int-bad-${randomUUID().slice(0, 8)}`
    const otherOrder = await admin
      .from('athlete_payment_orders')
      .insert({
        organization_id: ORGANIZATION_ID,
        athlete_id: athleteId,
        concept: 'registration',
        amount: AMOUNT,
        currency: 'ARS',
        method: 'mercado_pago',
        status: 'pendiente',
        reference: `WH-BAD-${randomUUID().slice(0, 8)}`,
      })
      .select('id')
      .single()
    if (otherOrder.error) throw new Error(otherOrder.error.message)

    const badApp = listen(
      createApp({
        supabaseAdmin: admin,
        mercadoPago: {
          async getPayment(id) {
            return {
              id: String(id),
              status: 'approved',
              status_detail: 'accredited',
              transaction_amount: 1_000,
              currency_id: 'ARS',
              external_reference: otherOrder.data.id,
            }
          },
        },
        notifyPaymentApplied: async () => {},
        env: {
          ...process.env,
          APP_PRODUCTION: 'false',
          MERCADO_PAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
        },
      }),
    )

    try {
      const response = await postWebhook(badApp, otherPaymentId)
      expect(response.status).toBeGreaterThanOrEqual(400)

      const after = await admin
        .from('athlete_payment_orders')
        .select('status')
        .eq('id', otherOrder.data.id)
        .single()
      expect(after.data.status).toBe('pendiente')

      // La falla queda asentada con su diagnostico, no se pierde en un 500.
      const trail = await admin
        .from('operational_event_logs')
        .select('action, status')
        .eq('entity_id', otherOrder.data.id)
      expect(trail.data.some((row) => row.status === 'failed')).toBe(true)
    } finally {
      await admin.from('operational_event_logs').delete().eq('entity_id', otherOrder.data.id)
      await admin.from('athlete_payments').delete().eq('order_id', otherOrder.data.id)
      await admin.from('athlete_payment_orders').delete().eq('id', otherOrder.data.id)
      await admin.from('payment_integration_events').delete().eq('resource_id', otherPaymentId)
      await badApp.close()
    }
  })
})
