import { describe, expect, it } from 'vitest'
import {
  operatorFailureMessage,
  presentAuditEvent,
  resolveAuditHeadline,
  synthesizeAuditDiagnosis,
} from '../src/lib/auditPresentation.js'
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

  it('traduce los códigos crudos del ciclo de webhook en el titular', () => {
    // `unsupported_type` no es un pago rechazado: es una notificación de
    // merchant_order descartada a propósito, y el titular tiene que decirlo.
    expect(operatorFailureMessage('unsupported_type', null, null)).toMatch(
      /no es un pago rechazado/i,
    )
    expect(operatorFailureMessage(null, null, 'cc_rejected_call_for_authorize')).toMatch(
      /autorización/i,
    )
  })
})

describe('synthesizeAuditDiagnosis', () => {
  it('convierte el reason crudo de un descarte en diagnóstico con pasos', () => {
    // Cubre las filas históricas, que no guardaron `diagnosis` en la base.
    const diagnosis = synthesizeAuditDiagnosis({
      reason: 'unsupported_type',
      notificationType: 'merchant_order',
    })

    expect(diagnosis.code).toBe('unsupported_type')
    expect(diagnosis.title).toMatch(/no es un pago rechazado/i)
    expect(diagnosis.cause).toMatch(/merchant_order/)
    expect(diagnosis.fix.length).toBeGreaterThan(0)
    expect(diagnosis.retryable).toBe(false)
  })

  it('convierte un status_detail de Mercado Pago en por qué y cómo resolverlo', () => {
    const diagnosis = synthesizeAuditDiagnosis({ statusDetail: 'cc_rejected_insufficient_amount' })

    expect(diagnosis.title).toMatch(/fondos/i)
    expect(diagnosis.fix[0]).toMatch(/otro medio de pago|límite/i)
  })

  it('usa la explicación que guardó el backend para un código no catalogado acá', () => {
    const diagnosis = synthesizeAuditDiagnosis({
      statusDetail: 'cc_rejected_algo_nuevo',
      statusDetailMeaning: 'Explicación que ya dejó el catálogo del servidor.',
    })

    expect(diagnosis.cause).toBe('Explicación que ya dejó el catálogo del servidor.')
  })

  it('no inventa una falla sobre un pago acreditado ni sin datos', () => {
    expect(synthesizeAuditDiagnosis({ statusDetail: 'accredited' })).toBeNull()
    expect(
      synthesizeAuditDiagnosis({ statusDetail: 'accredited', statusDetailMeaning: 'Acreditado.' }),
    ).toBeNull()
    expect(synthesizeAuditDiagnosis({})).toBeNull()
    expect(synthesizeAuditDiagnosis(null)).toBeNull()
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
