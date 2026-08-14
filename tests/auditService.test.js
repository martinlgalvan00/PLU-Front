import { describe, expect, it } from 'vitest'
import { auditActionTone, normalizeAuditEntry } from '../src/services/auditService.js'

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
