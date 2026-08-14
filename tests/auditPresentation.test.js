import { describe, expect, it } from 'vitest'
import { presentAuditEvent } from '../src/lib/auditPresentation.js'

describe('presentAuditEvent', () => {
  it('pone el error como lead y deja el intento como hecho operativo', () => {
    const presented = presentAuditEvent({
      summary: [
        { field: 'attempt', value: 5 },
        {
          field: 'error',
          value:
            'Si quieres conocer los motivos del rechazo, por favor ingresá a tu cuenta de Mercado Pago.',
        },
        { field: 'externalPaymentId', value: '1234567890' },
      ],
    })

    expect(presented.leadKind).toBe('error')
    expect(presented.lead).toContain('motivos del rechazo')
    expect(presented.facts).toEqual([
      { field: 'attempt', value: 5 },
      { field: 'externalPaymentId', value: '1234567890' },
    ])
  })

  it('usa el motivo cuando no hay error', () => {
    const presented = presentAuditEvent({
      summary: [{ field: 'reason', value: 'La orden ya estaba acreditada.' }],
    })

    expect(presented.leadKind).toBe('reason')
    expect(presented.lead).toBe('La orden ya estaba acreditada.')
    expect(presented.facts).toEqual([])
  })

  it('nunca renderiza "[object Object]" cuando el error llega como objeto', () => {
    const presented = presentAuditEvent({
      summary: [
        {
          field: 'error',
          value: { message: 'El monto no coincide con la preferencia.', code: 'AMOUNT_MISMATCH' },
        },
      ],
    })

    expect(presented.leadKind).toBe('error')
    expect(presented.lead).toBe('El monto no coincide con la preferencia.')
    expect(presented.lead).not.toContain('[object Object]')
  })
})
