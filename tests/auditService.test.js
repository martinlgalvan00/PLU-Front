import { describe, expect, it } from 'vitest'
import {
  auditActionTone,
  auditEntryTone,
  describeAuditError,
  normalizeAuditEntry,
  residualMetadata,
} from '../src/services/auditService.js'

describe('normalizeAuditEntry', () => {
  it('conserva valores planos de metadata en el resumen', () => {
    const entry = normalizeAuditEntry({
      id: '1',
      source: 'payment',
      action: 'payment_attempt.failed',
      entity_type: 'athlete_payment_order',
      entity_id: 'order-1',
      actor_type: 'system',
      actor_id: null,
      status: 'failed',
      severity: 'danger',
      metadata: { attempt: 3, reference: 'PLU-0001' },
      created_at: '2026-08-01T00:00:00Z',
    })

    expect(entry.summary).toEqual([
      { field: 'reference', value: 'PLU-0001' },
      { field: 'attempt', value: 3 },
    ])
  })

  it('extrae el mensaje cuando metadata.error llega como objeto, en vez de pasar el objeto crudo', () => {
    const entry = normalizeAuditEntry({
      id: '2',
      source: 'payment',
      action: 'payment_attempt.failed',
      entity_type: 'athlete_payment_order',
      entity_id: 'order-2',
      actor_type: 'system',
      actor_id: null,
      status: 'failed',
      severity: 'danger',
      metadata: {
        attempt: 1,
        error: {
          message: 'El monto no coincide con la preferencia.',
          code: 'AMOUNT_MISMATCH',
          stack: 'Error: ...',
        },
      },
      created_at: '2026-08-01T00:00:00Z',
    })

    const errorField = entry.summary.find((item) => item.field === 'error')
    expect(errorField?.value).toBe('El monto no coincide con la preferencia.')
    expect(String(errorField?.value)).not.toContain('[object Object]')
  })

  it('descarta metadata.error sin mensaje en vez de mostrar un objeto vacío', () => {
    const entry = normalizeAuditEntry({
      id: '3',
      source: 'payment',
      action: 'payment_attempt.failed',
      entity_type: 'athlete_payment_order',
      entity_id: 'order-3',
      actor_type: 'system',
      actor_id: null,
      status: 'failed',
      severity: 'danger',
      metadata: { error: { code: 'UNKNOWN' } },
      created_at: '2026-08-01T00:00:00Z',
    })

    expect(entry.summary.find((item) => item.field === 'error')).toBeUndefined()
  })
})

describe('auditActionTone', () => {
  it('devuelve el tono configurado para una acción conocida', () => {
    expect(auditActionTone('payment_attempt.failed')).toBe('danger')
  })

  it('cae a "default" para una acción sin tono configurado', () => {
    expect(auditActionTone('unknown.action')).toBe('default')
  })
})

describe('auditEntryTone', () => {
  it('baja a advertencia una falla de webhook ya contenida aunque la fila histórica diga danger', () => {
    expect(auditEntryTone({
      action: 'payment_webhook.failed',
      severity: 'danger',
      metadata: { error: '[ORDER_AMOUNT_MISMATCH] webhook: Monto de pago inválido para la orden.' },
    })).toBe('warning')
  })

  it('mantiene como crítico un diagnóstico que bloquea todos los cobros', () => {
    expect(auditEntryTone({
      action: 'payment.webhook_failed',
      severity: 'warning',
      metadata: { diagnosis: { severity: 'blocker' } },
    })).toBe('danger')
  })
})

/**
 * Forma real de un `payment.failed` de producción. El backend venía guardando
 * todo esto desde el principio; el panel se quedaba con `error.message` y el
 * resto sólo se podía ver consultando la base a mano.
 */
const REAL_FAILURE = {
  requestId: '67f74ded-e599-4f0c-844c-c5ed7c87759c',
  stage: 'order_create:membership',
  entrypoint: 'http:POST /api/athletes/me/membership-orders',
  error: {
    code: 'EMAIL_NOT_VERIFIED',
    name: 'HttpError',
    status: 403,
    message: 'Confirmá tu correo antes de continuar.',
    stack: 'HttpError: Confirmá tu correo antes de continuar.\n    at assertEmailVerified (server/routes/athletes.js:526:13)',
    origin: { file: 'server/routes/athletes.js', line: 526, column: 13, function: 'assertEmailVerified' },
    cause: null,
    provider: null,
  },
  diagnosis: {
    code: 'EVENT_SOLD_OUT',
    title: 'El evento no tiene cupo',
    cause: 'La inscripción se cortó porque el evento llegó a su capacidad.',
    fix: ['Confirmar la capacidad en Panel > Eventos.', 'Ampliar el cupo y avisar.'],
    scope: 'dominio',
    severity: 'expected',
    retryable: false,
  },
}

describe('describeAuditError', () => {
  it('rescata todo lo que hace falta para diagnosticar, no sólo el mensaje', () => {
    const detail = describeAuditError(REAL_FAILURE)

    expect(detail.message).toBe('Confirmá tu correo antes de continuar.')
    expect(detail.code).toBe('EMAIL_NOT_VERIFIED')
    expect(detail.name).toBe('HttpError')
    expect(detail.httpStatus).toBe(403)
    expect(detail.stage).toBe('order_create:membership')
    expect(detail.entrypoint).toBe('http:POST /api/athletes/me/membership-orders')
    expect(detail.requestId).toBe('67f74ded-e599-4f0c-844c-c5ed7c87759c')
    // La coordenada que lleva al código sin leer el stack entero.
    expect(detail.origin).toEqual({
      file: 'server/routes/athletes.js', line: 526, column: 13, function: 'assertEmailVerified',
    })
    expect(detail.stack).toContain('assertEmailVerified')
  })

  it('estructura el diagnóstico en vez de aplastarlo a "[object Object]"', () => {
    // `diagnosis` es el campo que contesta "por qué falló" y "qué hago con
    // esto"; convertirlo con String() lo volvía ilegible justo a él.
    const { diagnosis } = describeAuditError(REAL_FAILURE)

    expect(diagnosis.title).toBe('El evento no tiene cupo')
    expect(diagnosis.cause).toContain('llegó a su capacidad')
    expect(diagnosis.fix).toHaveLength(2)
    // `false` es información, no ausencia: dice que reintentar no sirve.
    expect(diagnosis.retryable).toBe(false)
  })

  it('arma la cadena de causas de la más externa a la más profunda', () => {
    const detail = describeAuditError({
      error: {
        message: 'No se pudo cobrar',
        cause: { name: 'FetchError', message: 'socket hang up', cause: { message: 'ECONNRESET' } },
      },
    })

    expect(detail.causes.map((cause) => cause.message)).toEqual([
      'socket hang up',
      'ECONNRESET',
    ])
  })

  it('no se cuelga con una cadena de causas circular', () => {
    const circular = { message: 'raíz' }
    circular.cause = circular

    expect(() => describeAuditError({ error: { message: 'x', cause: circular } })).not.toThrow()
  })

  it('acepta el error como texto plano, que es como lo guarda email.bounced', () => {
    const detail = describeAuditError({ error: 'Unable to find MX of domain pluarg.test' })

    expect(detail.message).toBe('Unable to find MX of domain pluarg.test')
    expect(detail.stack).toBeNull()
  })

  it('devuelve null cuando el evento no tiene nada que diagnosticar', () => {
    // Un alta exitosa no tiene por qué mostrar un bloque "Qué falló" vacío.
    expect(describeAuditError({ roleKey: 'plu_arg', channel: 'panel' })).toBeNull()
    expect(describeAuditError(null)).toBeNull()
  })
})

describe('residualMetadata', () => {
  it('deja fuera lo que ya subió a bloques con nombre propio', () => {
    // Sin esto el volcado crudo repetiría el stack completo debajo del bloque
    // que acaba de mostrarlo.
    const residual = residualMetadata(REAL_FAILURE)

    expect(residual.error).toBeUndefined()
    expect(residual.diagnosis).toBeUndefined()
    expect(residual.stage).toBeUndefined()
    expect(residual.requestId).toBeUndefined()
  })

  it('conserva lo que no tiene lugar propio', () => {
    const residual = residualMetadata({ amount: 75000, concept: 'membership', error: 'x' })

    expect(residual).toEqual({ amount: 75000, concept: 'membership' })
  })
})
