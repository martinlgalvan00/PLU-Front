import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { errorHandler, HttpError } from '../server/lib/errors.js'
import {
  logger,
  maskEmail,
  redact,
  runWithRequestContext,
  serializeError,
} from '../server/lib/logger.js'
import {
  createPaymentAuditTrail,
  summarizeFailure,
} from '../server/modules/payments/paymentAuditTrail.js'
import {
  diagnosePaymentFailure,
  explainPaymentStatusDetail,
  listPaymentFailureCodes,
} from '../server/modules/payments/paymentFailureCatalog.js'
import { createPaymentPreference, processPaymentWebhook } from '../server/modules/payments/paymentWorkflow.js'

const ORDER_ID = '2f2d6f42-9c39-4a2f-95ff-4b0ff1e7b1de'
const ACCESS_TOKEN = 'test-order-access-token-with-enough-entropy'

function captureLogs() {
  const lines = []
  const spies = ['error', 'warn', 'info'].map((level) =>
    vi.spyOn(console, level).mockImplementation((line) => lines.push(String(line))))
  return {
    lines,
    parsed: () => lines.map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  }
}

function order(overrides = {}) {
  return {
    id: ORDER_ID,
    kind: 'athlete',
    organizationId: '00000000-0000-4000-8000-000000000001',
    athleteId: 'athlete-1',
    amount: 75_000,
    currency: 'ARS',
    concept: 'membership',
    method: 'mercado_pago',
    status: 'pendiente',
    reference: 'MP-1',
    payerEmail: 'atleta@example.com',
    ...overrides,
  }
}

/** Cliente Supabase de mentira que junta los asientos de auditoria. */
function auditClientStub() {
  const rows = []
  return {
    rows,
    from(table) {
      return {
        async insert(row) {
          rows.push({ table, row })
          return { data: row, error: null }
        },
      }
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger estructurado', () => {
  it('serializa el stack y toda la cadena de causas', () => {
    const root = new Error('la RPC no existe')
    const wrapper = new HttpError(503, 'No se pudo aplicar el pago.', undefined, { cause: root })

    const serialized = serializeError(wrapper)

    expect(serialized.status).toBe(503)
    expect(serialized.stack).toContain('No se pudo aplicar el pago.')
    // Sin recorrer `cause` el log decia solo el mensaje de arriba: el motivo
    // real (la RPC ausente) quedaba invisible.
    expect(serialized.cause.message).toBe('la RPC no existe')
    expect(serialized.cause.stack).toContain('la RPC no existe')
  })

  it('nunca deja pasar secretos ni datos de tarjeta', () => {
    const redacted = redact({
      token: 'card-token-abc',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-secreto',
      authorization: 'Bearer x',
      payer: { email: 'atleta@example.com', security_code: '123' },
      amount: 75_000,
    })

    expect(redacted.token).toBe('[redacted]')
    expect(redacted.MERCADO_PAGO_ACCESS_TOKEN).toBe('[redacted]')
    expect(redacted.authorization).toBe('[redacted]')
    expect(redacted.payer.security_code).toBe('[redacted]')
    // El email se enmascara pero conserva el dominio: alcanza para correlacionar.
    expect(redacted.payer.email).toBe('at****@example.com')
    expect(redacted.amount).toBe(75_000)
  })

  it('propaga el requestId a todo lo que se loguee dentro del contexto', () => {
    const logs = captureLogs()
    runWithRequestContext({ requestId: 'req-abc-123' }, () => {
      logger.error('payment.failed', { orderId: ORDER_ID })
    })
    const [entry] = logs.parsed()
    logs.restore()

    expect(entry.requestId).toBe('req-abc-123')
    expect(entry.event).toBe('payment.failed')
  })

  it('maskEmail no revela la casilla completa', () => {
    expect(maskEmail('presidencia@pluarg.com')).toBe('pr*********@pluarg.com')
    expect(maskEmail('sin-arroba')).toBe('[redacted]')
  })
})

describe('catalogo de diagnostico', () => {
  it('reconoce las fallas que dejan plata sin acreditar', () => {
    expect(diagnosePaymentFailure(new HttpError(503, 'Falta MERCADO_PAGO_WEBHOOK_SECRET.')).code)
      .toBe('MP_WEBHOOK_SECRET_MISSING')
    expect(diagnosePaymentFailure(new HttpError(401, 'Firma de webhook invalida.')).code)
      .toBe('MP_WEBHOOK_SIGNATURE_INVALID')
    expect(diagnosePaymentFailure(new HttpError(409, 'Monto de pago invalido para la orden.')).code)
      .toBe('ORDER_AMOUNT_MISMATCH')
    expect(diagnosePaymentFailure({ message: 'PGRST202 Could not find the function' }).code)
      .toBe('SUPABASE_RPC_MISSING')
  })

  it('siempre devuelve pasos concretos, incluso ante una falla desconocida', () => {
    const diagnosis = diagnosePaymentFailure(new Error('algo rarisimo'))
    expect(diagnosis.code).toBe('UNCLASSIFIED_PAYMENT_FAILURE')
    expect(diagnosis.fix.length).toBeGreaterThan(0)
    expect(diagnosis.severity).toBe('degraded')
  })

  it('distingue los casos esperables de los bloqueantes', () => {
    expect(diagnosePaymentFailure(new HttpError(409, 'La orden ya no admite pagos.')).severity)
      .toBe('expected')
    expect(diagnosePaymentFailure(new HttpError(503, 'Mercado Pago no esta configurado en el servidor.')).severity)
      .toBe('blocker')
  })

  it('traduce el status_detail de Mercado Pago a lenguaje operativo', () => {
    expect(explainPaymentStatusDetail('cc_rejected_insufficient_amount')).toMatch(/Fondos insuficientes/)
    expect(explainPaymentStatusDetail('detalle_inventado')).toMatch(/no catalogado/i)
    expect(explainPaymentStatusDetail('')).toBeNull()
  })

  it('no tiene codigos duplicados', () => {
    const codes = listPaymentFailureCodes()
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('bitacora del ciclo de cobro', () => {
  it('asienta la falla con stack, etapa y remediacion', async () => {
    const client = auditClientStub()
    const trail = createPaymentAuditTrail({ client })
    const error = new HttpError(409, 'Monto de pago invalido para la orden.')

    await runWithRequestContext({ requestId: 'req-1' }, () =>
      trail.recordFailure({ stage: 'webhook', order: order(), error, externalPaymentId: 'mp-99' }))

    const [{ table, row }] = client.rows
    expect(table).toBe('operational_event_logs')
    expect(row.source).toBe('payment')
    expect(row.status).toBe('failed')
    expect(row.metadata.stage).toBe('webhook')
    expect(row.metadata.requestId).toBe('req-1')
    expect(row.metadata.diagnosis.code).toBe('ORDER_AMOUNT_MISMATCH')
    expect(row.metadata.diagnosis.fix.length).toBeGreaterThan(0)
    expect(row.metadata.error.stack).toContain('Monto de pago invalido')
    // El email del pagador nunca se guarda en claro.
    expect(row.metadata.payerEmail).toBe('at****@example.com')
  })

  it('no asienta dos veces la misma falla aunque la vean varias capas', async () => {
    const client = auditClientStub()
    const trail = createPaymentAuditTrail({ client })
    const error = new HttpError(503, 'No se pudo aplicar el pago.')

    await trail.recordFailure({ stage: 'apply', order: order(), error })
    await trail.recordFailure({ stage: 'embedded', order: order(), error })

    expect(client.rows).toHaveLength(1)
    expect(client.rows[0].row.metadata.stage).toBe('apply')
  })

  it('sin cliente Supabase queda en no-op y no rompe el cobro', async () => {
    const trail = createPaymentAuditTrail({ client: null })
    await expect(trail.record({ action: 'payment.applied', order: order() })).resolves.toBe(false)
    await expect(trail.recordFailure({ error: new Error('x') })).resolves.toBe(false)
  })

  it('un fallo al escribir la auditoria no interrumpe la operacion', async () => {
    const client = {
      from: () => ({ insert: async () => ({ error: { message: 'permission denied' } }) }),
    }
    const logs = captureLogs()
    const trail = createPaymentAuditTrail({ client })

    await expect(trail.record({ action: 'payment.applied', order: order() })).resolves.toBe(false)
    logs.restore()
  })

  it('el resumen persistido lleva el codigo del catalogo y el requestId', () => {
    const summary = runWithRequestContext({ requestId: 'req-42' }, () =>
      summarizeFailure(new HttpError(401, 'Firma de webhook invalida.'), { stage: 'webhook' }))

    expect(summary).toContain('[MP_WEBHOOK_SIGNATURE_INVALID]')
    expect(summary).toContain('requestId=req-42')
    expect(summary.length).toBeLessThanOrEqual(1_900)
  })
})

describe('trazabilidad del flujo de pago', () => {
  it('registra la falla de la preferencia con la orden afectada', async () => {
    const client = auditClientStub()
    const auditTrail = createPaymentAuditTrail({ client })
    const repository = { getOrder: vi.fn(async () => order()) }
    const mercadoPago = {
      createPreference: vi.fn(async () => {
        throw new HttpError(503, 'Mercado Pago no esta configurado en el servidor.')
      }),
    }

    await expect(
      createPaymentPreference({ paymentOrderId: ORDER_ID }, { repository, mercadoPago, auditTrail }),
    ).rejects.toMatchObject({ status: 503 })

    const [{ row }] = client.rows
    expect(row.action).toBe('payment.failed')
    expect(row.entity_id).toBe(ORDER_ID)
    expect(row.metadata.stage).toBe('preference')
    expect(row.metadata.diagnosis.code).toBe('MP_ACCESS_TOKEN_MISSING')
  })

  it('deja rastro de una notificacion rechazada antes de persistirse', async () => {
    const client = auditClientStub()
    const auditTrail = createPaymentAuditTrail({ client })
    const repository = { recordWebhook: vi.fn() }

    await expect(processPaymentWebhook(
      { body: { id: 1, data: { id: '99' } }, query: {}, headers: {} },
      { repository, mercadoPago: {}, auditTrail },
    )).rejects.toMatchObject({ status: 400 })

    // Una firma invalida o un payload roto no llegan al inbox: sin este
    // asiento no quedaba ninguna evidencia de que la notificacion existio.
    expect(repository.recordWebhook).not.toHaveBeenCalled()
    const [{ row }] = client.rows
    expect(row.action).toBe('payment.webhook_failed')
    expect(row.metadata.reason).toBe('missing_data_id')
    expect(row.metadata.error.stack).toBeTruthy()
  })

  it('asienta la acreditacion con el detalle traducido del proveedor', async () => {
    const client = auditClientStub()
    const auditTrail = createPaymentAuditTrail({ client })
    const { applyCanonicalPayment } = await import('../server/modules/payments/paymentWorkflow.js')
    const repository = { applyPayment: vi.fn(async () => ({ order: { id: ORDER_ID, status: 'aprobado' } })) }

    await applyCanonicalPayment(
      {
        id: 'mp-1',
        external_reference: ORDER_ID,
        status: 'approved',
        status_detail: 'accredited',
        transaction_amount: 75_000,
        currency_id: 'ARS',
        payer: { email: 'atleta@example.com' },
      },
      order(),
      { repository, auditTrail, stage: 'webhook' },
    )

    const [{ row }] = client.rows
    expect(row.action).toBe('payment.applied')
    expect(row.severity).toBe('success')
    expect(row.metadata.statusDetailMeaning).toBe('Acreditado.')
    expect(row.metadata.externalPaymentId).toBe('mp-1')
  })
})

describe('errorHandler', () => {
  it('loguea el stack y devuelve el requestId en un 500', () => {
    const logs = captureLogs()
    const res = {
      statusCode: 0,
      body: null,
      status(code) { this.statusCode = code; return this },
      json(payload) { this.body = payload; return this },
    }

    errorHandler(
      new Error('la base se cayo'),
      { requestId: 'req-500', method: 'POST', originalUrl: '/api/payments/embedded/process' },
      res,
      () => {},
    )
    const entry = logs.parsed().find((line) => line.event === 'api.error')
    logs.restore()

    // El mensaje al cliente sigue siendo opaco, pero ahora se puede rastrear.
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno', requestId: 'req-500' })
    expect(entry.err.stack).toContain('la base se cayo')
    expect(entry.diagnosis.fix.length).toBeGreaterThan(0)
  })

  it('no filtra el detalle interno en un 4xx de negocio', () => {
    const logs = captureLogs()
    const res = {
      statusCode: 0,
      body: null,
      status(code) { this.statusCode = code; return this },
      json(payload) { this.body = payload; return this },
    }

    errorHandler(
      new HttpError(409, 'La orden ya no admite pagos.', { code: 'PLU05' }),
      { requestId: 'req-409', method: 'POST', originalUrl: '/api/payments/embedded/process' },
      res,
      () => {},
    )
    logs.restore()

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'La orden ya no admite pagos.', code: 'PLU05' })
  })
})

describe('correlacion de extremo a extremo', () => {
  it('devuelve X-Request-Id en toda respuesta y respeta el id entrante', async () => {
    const app = createApp({ supabaseAdmin: null, env: { APP_PRODUCTION: 'false' } })
    const server = app.listen(0)
    const { port } = server.address()

    const generated = await fetch(`http://127.0.0.1:${port}/api/health`)
    const propagated = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'X-Request-Id': 'incidente-2026-08-13' },
    })
    await new Promise((resolve) => server.close(resolve))

    expect(generated.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/)
    // Mercado Pago manda su propio x-request-id en el webhook: reusarlo pega
    // nuestra traza a la notificacion que se ve en su panel.
    expect(propagated.headers.get('x-request-id')).toBe('incidente-2026-08-13')
  })

  it('el checkout embebido responde con el id que quedo en el log', async () => {
    const repository = {
      getOrder: vi.fn(async () => order({ kind: 'ticket', athleteId: null })),
      assertTicketOrderAccess: vi.fn(async () => ({ id: ORDER_ID })),
      claimEmbeddedAttempt: vi.fn(async () => { throw new Error('supabase caido') }),
    }
    const app = createApp({
      paymentRepository: repository,
      mercadoPago: {},
      env: { APP_PRODUCTION: 'false', PAID_CHECKOUT_ENABLED: 'true' },
    })
    const server = app.listen(0)
    const { port } = server.address()

    const logs = captureLogs()
    const response = await fetch(`http://127.0.0.1:${port}/api/payments/embedded/process`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({
        paymentOrderId: ORDER_ID,
        orderAccessToken: ACCESS_TOKEN,
        formData: { token: 'temporary-card-token', payment_method_id: 'visa', payer: { email: 'a@b.com' } },
      }),
    })
    const body = await response.json()
    const entry = logs.parsed().find((line) => line.event === 'api.error')
    logs.restore()
    await new Promise((resolve) => server.close(resolve))

    expect(response.status).toBe(500)
    expect(body.requestId).toBe(response.headers.get('x-request-id'))
    expect(entry.requestId).toBe(body.requestId)
    expect(entry.err.stack).toContain('supabase caido')
  })
})

describe('cableado de la bitacora en las rutas de pago', () => {
  it('el checkout embebido deja el ciclo completo asentado', async () => {
    const auditClient = auditClientStub()
    const repository = {
      getOrder: vi.fn(async () => order({ kind: 'ticket', athleteId: null })),
      assertTicketOrderAccess: vi.fn(async () => ({ id: ORDER_ID })),
      claimEmbeddedAttempt: vi.fn(async () => ({
        created: true,
        attempt: { id: 'attempt-1', idempotency_key: 'server-key' },
      })),
      completeEmbeddedAttempt: vi.fn(async () => undefined),
      completeEmbeddedReconciliation: vi.fn(async () => undefined),
      applyPayment: vi.fn(async () => ({ order: { id: ORDER_ID, status: 'aprobado' } })),
    }
    const mercadoPago = {
      createPayment: vi.fn(async ({ order: target }) => ({
        id: 'mp-77',
        status: 'approved',
        status_detail: 'accredited',
        transaction_amount: target.amount,
        currency_id: target.currency,
        external_reference: target.id,
        payment_method_id: 'visa',
        payer: { email: 'comprador@example.com' },
      })),
    }
    const app = createApp({
      supabaseAdmin: auditClient,
      paymentRepository: repository,
      mercadoPago,
      env: { APP_PRODUCTION: 'false', PAID_CHECKOUT_ENABLED: 'true' },
    })
    const server = app.listen(0)
    const { port } = server.address()

    const response = await fetch(`http://127.0.0.1:${port}/api/payments/embedded/process`, {
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
    await new Promise((resolve) => server.close(resolve))

    expect(response.status).toBe(201)
    // Las tres etapas del cobro quedan asentadas, no solo el resultado final.
    const trail = auditClient.rows.filter((entry) => entry.table === 'operational_event_logs')
    expect(trail.map((entry) => entry.row.action)).toEqual([
      'payment.attempt_claimed',
      'payment.provider_submitted',
      'payment.applied',
    ])
    const applied = trail.at(-1)
    expect(applied.row.metadata.externalPaymentId).toBe('mp-77')
    expect(applied.row.metadata.requestId).toBe(response.headers.get('x-request-id'))
  })
})
