import { describe, expect, it } from 'vitest'
import { HttpError } from '../server/lib/errors.js'
import {
  addBreadcrumb,
  getBreadcrumbs,
  originFrame,
  runWithRequestContext,
  serializeError,
} from '../server/lib/logger.js'
import {
  buildAthleteTimeline,
  buildOrderTimeline,
  buildRequestTimeline,
} from '../server/modules/payments/paymentForensics.js'

const ORG = '00000000-0000-4000-8000-000000000001'
const ORDER_ID = '1a4d9f2c-77bb-4a55-9f31-6b3a0c1d8e42'
const ATHLETE_ID = '2b5e0a3d-88cc-4b66-a042-7c4b1d2e9f53'

/**
 * Cliente Supabase de mentira: devuelve filas por tabla y registra los filtros
 * aplicados. Alcanza para fijar el contrato del informe forense sin depender
 * de una base levantada.
 */
function clientWith(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? []
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        contains: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve) => resolve({ data: rows, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
      }
      return chain
    },
  }
}

function failureMetadata(overrides = {}) {
  return {
    stage: 'webhook',
    requestId: 'req-forense',
    entrypoint: 'http:POST /api/payments/webhook/mercadopago',
    error: {
      message: 'Monto de pago invalido para la orden.',
      status: 409,
      origin: { file: 'server/modules/payments/paymentWorkflow.js', line: 88, function: 'applyCanonicalPayment' },
      stack: 'HttpError: Monto de pago invalido para la orden.\n    at applyCanonicalPayment (...)',
    },
    trail: [
      { atMs: 12, event: 'webhook.signature_verified' },
      { atMs: 340, event: 'payment.apply_started', orderAmount: 75_000, paymentAmount: 50_000 },
    ],
    ...overrides,
  }
}

describe('donde falla: marco de origen', () => {
  it('salta node_modules y apunta al archivo propio', () => {
    const error = new Error('boom')
    error.stack = [
      'Error: boom',
      '    at RequestManager.send (C:\\repo\\node_modules\\mercadopago\\dist\\index.js:120:15)',
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
      '    at createPayment (file:///C:/repo/server/modules/payments/mercadoPagoAdapter.js:231:20)',
    ].join('\n')

    // Sin esto, "donde fallo" era la primera linea del stack: siempre el SDK.
    expect(originFrame(error)).toEqual({
      file: 'server/modules/payments/mercadoPagoAdapter.js',
      line: 231,
      column: 20,
      function: 'createPayment',
    })
  })

  it('viaja dentro del error serializado', () => {
    const serialized = serializeError(new HttpError(409, 'Monto invalido'))
    expect(serialized.origin.file).toContain('tests/paymentForensics.test.js')
    expect(serialized.origin.line).toBeGreaterThan(0)
  })

  it('no inventa un origen cuando no hay stack', () => {
    expect(originFrame({ message: 'sin stack' })).toBeNull()
  })
})

describe('que paso antes: rastro de pasos', () => {
  it('acumula los pasos de la operacion con su tiempo', async () => {
    const crumbs = await runWithRequestContext({ requestId: 'req-1' }, async () => {
      addBreadcrumb('order.resolved', { orderId: ORDER_ID })
      addBreadcrumb('mp.payment_created', { externalPaymentId: 'mp-1' })
      return getBreadcrumbs()
    })

    expect(crumbs.map((crumb) => crumb.event)).toEqual(['order.resolved', 'mp.payment_created'])
    expect(crumbs[0].atMs).toBeGreaterThanOrEqual(0)
    expect(crumbs[1].externalPaymentId).toBe('mp-1')
  })

  it('fuera de un contexto no rompe ni acumula', () => {
    expect(addBreadcrumb('suelto')).toBe(false)
    expect(getBreadcrumbs()).toEqual([])
  })

  it('conserva los ultimos pasos cuando se llena', async () => {
    const crumbs = await runWithRequestContext({ requestId: 'req-2' }, async () => {
      for (let index = 0; index < 60; index += 1) addBreadcrumb(`paso-${index}`)
      return getBreadcrumbs()
    })

    // Los ultimos son los que explican la falla.
    expect(crumbs).toHaveLength(40)
    expect(crumbs.at(-1).event).toBe('paso-59')
  })
})

describe('linea de tiempo de una orden', () => {
  const baseTables = {
    athlete_payment_orders: [{
      id: ORDER_ID,
      organization_id: ORG,
      athlete_id: ATHLETE_ID,
      concept: 'membership',
      amount: 75_000,
      currency: 'ARS',
      method: 'mercado_pago',
      status: 'aprobado',
      reference: 'MORD-1',
      payer_email: 'atleta@example.com',
      created_at: '2026-08-01T10:00:00.000Z',
      athlete: { id: ATHLETE_ID, full_name: 'Atleta Uno', email: 'atleta@example.com' },
    }],
    athlete_payments: [{
      order_id: ORDER_ID,
      external_payment_id: 'mp-1',
      status: 'aprobado',
      amount: 75_000,
      currency: 'ARS',
      status_detail: 'accredited',
      payer_email: 'atleta@example.com',
      created_at: '2026-08-01T10:02:00.000Z',
      confirmed_at: '2026-08-01T10:02:00.000Z',
    }],
    embedded_payment_attempts: [{
      id: 'attempt-1',
      order_id: ORDER_ID,
      status: 'submitted',
      external_payment_id: 'mp-1',
      reconciliation_status: 'reconciled',
      reconciliation_attempts: 1,
      operation_kind: 'payment',
      created_at: '2026-08-01T10:01:00.000Z',
    }],
    payment_integration_events: [{
      id: 'event-1',
      notification_id: 'n-1',
      resource_id: 'mp-1',
      event_type: 'payment',
      action: 'payment.updated',
      status: 'processed',
      attempts_count: 1,
      max_attempts: 12,
      received_at: '2026-08-01T10:01:30.000Z',
    }],
    operational_event_logs: [{
      created_at: '2026-08-01T10:00:30.000Z',
      source: 'payment',
      action: 'payment.preference_created',
      status: 'pendiente',
      severity: 'success',
      metadata: { requestId: 'req-checkout' },
    }],
    memberships: [{
      id: 'membership-1',
      status: 'activa',
      year: 2026,
      member_code: 'PLU-ARG-2026-00000001',
      payment_order_id: ORDER_ID,
      created_at: '2026-08-01T10:02:05.000Z',
      expiration_date: '2027-08-01',
    }],
    event_registrations: [],
  }

  it('cruza las cinco fuentes en una sola secuencia ordenada', async () => {
    const report = await buildOrderTimeline(clientWith(baseTables), {
      orderId: ORDER_ID,
      organizationId: ORG,
    })

    expect(report.timeline.map((item) => item.source)).toEqual([
      'orden', 'bitacora', 'brick', 'webhook', 'ledger', 'dominio',
    ])
    // El tiempo entre pasos es lo que muestra donde se quedo parado un cobro.
    expect(report.timeline[1].sincePrevious).toBe('30.0 s')
    expect(report.verdict.state).toBe('ok')
    // El avance se deriva tambien de las tablas transaccionales, no solo de la
    // bitacora: las ordenes anteriores a la instrumentacion tienen que medirse
    // igual de bien.
    expect(report.stageReached).toBe('fulfilled')
    // El correo del pagador nunca sale en claro, ni siquiera en el informe.
    expect(report.timeline[0].detail.payerEmail).toBe('at****@example.com')
  })

  it('marca como critico un pago acreditado sin efecto de negocio', async () => {
    const report = await buildOrderTimeline(
      clientWith({ ...baseTables, memberships: [] }),
      { orderId: ORDER_ID, organizationId: ORG },
    )

    // Es la falla mas cara: el atleta pago y no tiene lo que compro.
    expect(report.verdict.state).toBe('critical')
    expect(report.verdict.action).toMatch(/Recuperar operaciones/)
  })

  it('explica una falla con su origen, entrada y pasos previos', async () => {
    const report = await buildOrderTimeline(
      clientWith({
        ...baseTables,
        athlete_payment_orders: [{ ...baseTables.athlete_payment_orders[0], status: 'pendiente' }],
        athlete_payments: [],
        memberships: [],
        operational_event_logs: [{
          created_at: '2026-08-01T10:03:00.000Z',
          source: 'payment',
          action: 'payment.webhook_failed',
          status: 'failed',
          severity: 'danger',
          metadata: failureMetadata(),
        }],
      }),
      { orderId: ORDER_ID, organizationId: ORG },
    )

    const [failure] = report.failures
    expect(failure.origin.file).toBe('server/modules/payments/paymentWorkflow.js')
    expect(failure.entrypoint).toBe('http:POST /api/payments/webhook/mercadopago')
    expect(failure.requestId).toBe('req-forense')
    expect(failure.diagnosis.code).toBe('ORDER_AMOUNT_MISMATCH')
    // El paso previo ya muestra los dos montos que no coincidieron.
    expect(failure.trail.at(-1)).toMatchObject({ orderAmount: 75_000, paymentAmount: 50_000 })
    expect(report.verdict.state).toBe('blocked')
  })

  it('falla con 404 cuando la orden no existe en ninguna tabla', async () => {
    await expect(
      buildOrderTimeline(clientWith({}), { orderId: ORDER_ID, organizationId: ORG }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('recorrido de afiliacion', () => {
  const athlete = {
    id: ATHLETE_ID,
    full_name: 'Atleta Uno',
    email: 'atleta@example.com',
    document_id: '30111222',
    status: 'registrado',
    created_at: '2026-08-01T09:00:00.000Z',
    email_verified_at: null,
  }

  it('senala el eslabon donde se corta el embudo', async () => {
    const report = await buildAthleteTimeline(
      clientWith({
        athletes: [athlete],
        athlete_payment_orders: [],
        memberships: [],
        event_registrations: [],
        operational_event_logs: [],
      }),
      { athleteId: ATHLETE_ID, organizationId: ORG },
    )

    expect(report.funnel.map((step) => step.done)).toEqual([true, false, false, false, false])
    expect(report.verdict.summary).toMatch(/email_verificado/)
    expect(report.athlete.email).toBe('at****@example.com')
  })

  it('detecta la afiliacion cobrada que nunca se activo', async () => {
    const report = await buildAthleteTimeline(
      clientWith({
        athletes: [{ ...athlete, email_verified_at: '2026-08-01T09:10:00.000Z' }],
        athlete_payment_orders: [{
          id: ORDER_ID,
          concept: 'membership',
          status: 'aprobado',
          amount: 75_000,
          currency: 'ARS',
          method: 'mercado_pago',
          created_at: '2026-08-01T10:00:00.000Z',
          approved_at: '2026-08-01T10:02:00.000Z',
        }],
        memberships: [],
        event_registrations: [],
        operational_event_logs: [],
      }),
      { athleteId: ATHLETE_ID, organizationId: ORG },
    )

    expect(report.verdict.state).toBe('critical')
    expect(report.verdict.action).toContain(ORDER_ID)
  })

  it('exige algun identificador', async () => {
    await expect(
      buildAthleteTimeline(clientWith({}), { organizationId: ORG }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('traza de una operacion puntual', () => {
  it('agrupa todo lo asentado con ese requestId', async () => {
    const report = await buildRequestTimeline(
      clientWith({
        operational_event_logs: [
          {
            created_at: '2026-08-01T10:00:00.000Z',
            source: 'payment',
            action: 'payment.attempt_claimed',
            entity_type: 'athlete_payment_order',
            entity_id: ORDER_ID,
            status: 'pendiente',
            severity: 'info',
            metadata: { requestId: 'req-forense', entrypoint: 'http:POST /api/payments/embedded/process' },
          },
          {
            created_at: '2026-08-01T10:00:02.000Z',
            source: 'payment',
            action: 'payment.failed',
            entity_type: 'athlete_payment_order',
            entity_id: ORDER_ID,
            status: 'failed',
            severity: 'danger',
            metadata: failureMetadata({ entrypoint: 'http:POST /api/payments/embedded/process' }),
          },
        ],
      }),
      { requestId: 'req-forense', organizationId: ORG },
    )

    expect(report.entrypoint).toBe('http:POST /api/payments/embedded/process')
    expect(report.entries).toHaveLength(2)
    expect(report.entries[1].failure.diagnosis.code).toBe('ORDER_AMOUNT_MISMATCH')
  })

  it('devuelve 404 si ese id no dejo rastro', async () => {
    await expect(
      buildRequestTimeline(clientWith({ operational_event_logs: [] }), {
        requestId: 'req-inexistente',
        organizationId: ORG,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
