import { describe, expect, it } from 'vitest'
import { operatorFailureMessage, presentAuditEvent, resolveAuditHeadline } from '../src/lib/auditPresentation.js'
import { buildAuditStatusFilterOptions } from '../src/lib/auditFilterHelpers.js'

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

describe('resolveAuditHeadline', () => {
  it('prioriza el título del diagnóstico sobre el mensaje crudo', () => {
    const headline = resolveAuditHeadline({
      summary: [{ field: 'error', value: 'payment not found in provider account' }],
      errorDetail: {
        message: 'payment not found in provider account',
        diagnosis: {
          title: 'Mercado Pago no reconoce ese pago',
          cause: 'La consulta devolvió 404.',
          fix: ['Comparar el id con la misma cuenta de MP.'],
        },
      },
    })

    expect(headline.headline).toBe('Mercado Pago no reconoce ese pago')
    expect(headline.suggestedAction).toBe('Comparar el id con la misma cuenta de MP.')
    expect(headline.technicalMessage).toBe('payment not found in provider account')
  })

  it('traduce patrones conocidos de proveedor', () => {
    expect(
      operatorFailureMessage('cc_rejected_high_risk', null, null),
    ).toContain('prevención de fraude')
    expect(operatorFailureMessage('Unable to find MX of domain pluarg.test')).toContain('DNS')
  })
})

describe('buildAuditStatusFilterOptions', () => {
  it('deduplica etiquetas de estado y prioriza problemáticos', () => {
    const statusLabel = (value) =>
      ({
        rejected: 'Rechazado',
        rechazado: 'Rechazado',
        delivered: 'Entregado',
        failed: 'Fallido',
      })[value] ?? value

    const options = buildAuditStatusFilterOptions(
      { statuses: ['delivered', 'rejected', 'rechazado', 'failed'] },
      statusLabel,
      'Todas',
    )

    expect(options.map(([value]) => value)).toEqual(['all', 'failed', 'rejected', 'delivered'])
    expect(options.filter(([, label]) => label === 'Rechazado')).toHaveLength(1)
  })
})
