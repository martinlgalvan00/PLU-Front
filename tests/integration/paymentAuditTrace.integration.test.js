import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './helpers/staffSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Auditoría forense contra la base real.
 *
 * Fija el contrato que usa Finanzas para contestar "pagué y no me figura":
 * la traza tiene que cruzar orden, bitácora, ledger y efecto de dominio, y
 * decir en qué eslabón se cortó — con la falla explicada, no con el texto
 * crudo del proveedor.
 */

const admin = createSupabaseTestClient()
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

let target
let cookie
let athleteId
let orderId
const requestId = `trace-test-${randomUUID()}`

beforeAll(async () => {
  const staffUser = await buildStaffUser({ email: 'staff-audit-trace@pluarg.test' })
  target = listen(
    createApp({
      prisma: createPrismaDouble([staffUser]),
      supabaseAdmin: admin,
      env: { ...process.env, APP_PRODUCTION: 'false', PAYMENTS_MOCK: 'true' },
    }),
  )
  ;({ cookie } = await loginStaff(target.url, { email: staffUser.email }))

  const document = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
  const athlete = await admin
    .from('athletes')
    .insert({
      organization_id: ORGANIZATION_ID,
      full_name: 'Atleta Forense',
      document_id: document,
      email: `forense-${randomUUID()}@pluarg.test`,
      birth_date: '1995-05-05',
      phone: '1122334455',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'La Plata',
      gym: 'Box Test',
      sex: 'Masculino',
      division: 'Open',
      category: 'Raw',
    })
    .select()
    .single()
  athleteId = athlete.data.id

  const order = await admin
    .from('athlete_payment_orders')
    .insert({
      organization_id: ORGANIZATION_ID,
      athlete_id: athleteId,
      concept: 'membership',
      amount: 75_000,
      currency: 'ARS',
      method: 'mercado_pago',
      status: 'pendiente',
      reference: `TRACE-${randomUUID().slice(0, 8)}`,
    })
    .select()
    .single()
  orderId = order.data.id

  // Falla real asentada como la escribe `paymentAuditTrail.recordFailure`.
  await admin.from('operational_event_logs').insert({
    organization_id: ORGANIZATION_ID,
    source: 'payment',
    action: 'payment.webhook_failed',
    entity_type: 'athlete_payment_order',
    entity_id: orderId,
    actor_type: 'athlete',
    actor_id: athleteId,
    status: 'failed',
    severity: 'danger',
    metadata: {
      stage: 'webhook',
      requestId,
      entrypoint: 'http:POST /api/payments/webhook/mercadopago',
      error: {
        message: 'Monto de pago invalido para la orden.',
        status: 409,
        origin: {
          file: 'server/modules/payments/paymentWorkflow.js',
          line: 92,
          function: 'applyCanonicalPayment',
        },
        stack: 'HttpError: Monto de pago invalido para la orden.\n    at applyCanonicalPayment',
      },
      trail: [
        { atMs: 8, event: 'webhook.signature_verified' },
        { atMs: 210, event: 'payment.apply_started', orderAmount: 75_000, paymentAmount: 50_000 },
      ],
      diagnosis: { code: 'ORDER_AMOUNT_MISMATCH', severity: 'degraded' },
    },
  })
})

afterAll(async () => {
  if (orderId) {
    await admin.from('operational_event_logs').delete().eq('entity_id', orderId)
    await admin.from('athlete_payment_orders').delete().eq('id', orderId)
  }
  if (athleteId) {
    await admin.from('operational_event_logs').delete().eq('actor_id', athleteId)
    await admin.from('operational_event_logs').delete().eq('entity_id', athleteId)
    await admin.from('memberships').delete().eq('athlete_id', athleteId)
    await admin.from('athletes').delete().eq('id', athleteId)
  }
  await target?.close()
})

describe('traza forense de un cobro', () => {
  it('reconstruye la orden con su falla explicada', async () => {
    const response = await fetch(`${target.url}/api/payments/audit/orders/${orderId}`, {
      headers: authHeaders(cookie),
    })
    expect(response.status).toBe(200)
    const report = await response.json()

    expect(report.order.id).toBe(orderId)
    expect(report.timeline.length).toBeGreaterThanOrEqual(2)

    const [failure] = report.failures
    // Donde se rompio, por donde entro y que venia pasando: las tres preguntas
    // que antes obligaban a reproducir el incidente.
    expect(failure.origin.file).toBe('server/modules/payments/paymentWorkflow.js')
    expect(failure.entrypoint).toContain('/api/payments/webhook/mercadopago')
    expect(failure.requestId).toBe(requestId)
    expect(failure.diagnosis.code).toBe('ORDER_AMOUNT_MISMATCH')
    expect(failure.diagnosis.fix.length).toBeGreaterThan(0)
    expect(failure.trail.at(-1)).toMatchObject({ orderAmount: 75_000, paymentAmount: 50_000 })
    expect(report.verdict.state).toBe('blocked')
  })

  it('reconstruye la operacion puntual por su requestId', async () => {
    const response = await fetch(`${target.url}/api/payments/audit/requests/${requestId}`, {
      headers: authHeaders(cookie),
    })
    expect(response.status).toBe(200)
    const report = await response.json()

    expect(report.requestId).toBe(requestId)
    expect(report.entrypoint).toContain('/api/payments/webhook/mercadopago')
    expect(report.entries[0].entityId).toBe(orderId)
  })

  it('muestra el recorrido de afiliacion y donde se corta', async () => {
    const response = await fetch(`${target.url}/api/payments/audit/athletes/${athleteId}`, {
      headers: authHeaders(cookie),
    })
    expect(response.status).toBe(200)
    const report = await response.json()

    const steps = Object.fromEntries(report.funnel.map((step) => [step.step, step.done]))
    expect(steps.alta).toBe(true)
    expect(steps.email_verificado).toBe(false)
    expect(steps.orden_emitida).toBe(true)
    expect(steps.afiliacion_activa).toBe(false)
    // El correo nunca sale en claro, ni siquiera para staff.
    expect(report.athlete.email).toMatch(/^fo\*+@pluarg\.test$/)
  })

  it('exige sesion de staff', async () => {
    const response = await fetch(`${target.url}/api/payments/audit/orders/${orderId}`, {
      headers: authHeaders(),
    })
    expect(response.status).toBe(401)
  })
})
