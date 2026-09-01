import { describe, expect, it } from 'vitest'
import {
  buildPaymentValidationItem,
  canApproveManualOrder,
  canValidateConcept,
  canValidateManualOrder,
  findOpenManualOrderForRegistration,
  hasPaymentProof,
  isCashOrder,
  isManualOrder,
  isOpenOrder,
} from '../src/services/paymentValidationService.js'

function order(overrides = {}) {
  return {
    id: 'ord-1',
    concept: 'combo',
    amount: 170000,
    currency: 'ARS',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
    status: 'validacion_manual',
    paymentProofPath: 'ord-1/comprobante.jpg',
    paymentProofUploadedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('elegibilidad de validación manual', () => {
  it('acepta una transferencia abierta con comprobante', () => {
    expect(canValidateManualOrder(order())).toBe(true)
  })

  it('rechaza una transferencia sin comprobante', () => {
    // La regla es la misma que aplica `approve_athlete_payment_order`: sin
    // archivo, acreditar es indistinguible de regalar la afiliación.
    expect(canValidateManualOrder(order({ paymentProofPath: null }))).toBe(false)
  })

  it('acepta efectivo en sede sin comprobante', () => {
    const cash = order({ manualPaymentChannel: 'cash_pitbull', paymentProofPath: null })
    expect(isCashOrder(cash)).toBe(true)
    expect(canValidateManualOrder(cash)).toBe(true)
  })

  it('permite a Finanzas aprobar una transferencia abierta sin comprobante', () => {
    expect(canApproveManualOrder(order({ paymentProofPath: null }))).toBe(true)
  })

  it('rechaza Mercado Pago aunque tenga comprobante', () => {
    const provider = order({ method: 'mercado_pago' })
    expect(isManualOrder(provider)).toBe(false)
    expect(canApproveManualOrder(provider)).toBe(false)
    expect(canValidateManualOrder(provider)).toBe(false)
  })

  it('rechaza una orden que ya cerró', () => {
    expect(isOpenOrder(order({ status: 'aprobado' }))).toBe(false)
    expect(canApproveManualOrder(order({ status: 'aprobado' }))).toBe(false)
    expect(canValidateManualOrder(order({ status: 'aprobado' }))).toBe(false)
    expect(canValidateManualOrder(order({ status: 'rechazado' }))).toBe(false)
  })

  it('lee la ruta del comprobante en snake_case y descarta cadenas vacías', () => {
    expect(hasPaymentProof({ payment_proof_path: 'x/y.jpg' })).toBe(true)
    expect(hasPaymentProof({ paymentProofPath: '   ' })).toBe(false)
  })
})

describe('interruptor de validación por concepto', () => {
  it('el combo necesita afiliación e inscripción habilitadas', () => {
    expect(canValidateConcept('combo', { membership: true, registration: true })).toBe(true)
    expect(canValidateConcept('combo', { membership: false, registration: true })).toBe(false)
    expect(canValidateConcept('combo', { membership: true, registration: false })).toBe(false)
  })

  it('un concepto simple sólo mira el suyo', () => {
    expect(canValidateConcept('membership', { membership: false, registration: true })).toBe(false)
    expect(canValidateConcept('registration', { membership: false, registration: true })).toBe(true)
  })
})

describe('orden abierta de una inscripción', () => {
  const registration = { id: 'reg-1', paymentOrderId: 'ord-1' }

  it('devuelve la orden manual abierta', () => {
    expect(findOpenManualOrderForRegistration([order()], registration)?.id).toBe('ord-1')
  })

  it('no devuelve una orden de Mercado Pago', () => {
    expect(
      findOpenManualOrderForRegistration([order({ method: 'mercado_pago' })], registration),
    ).toBeNull()
  })

  it('no devuelve nada si la inscripción no tiene orden', () => {
    expect(findOpenManualOrderForRegistration([order()], { id: 'reg-2' })).toBeNull()
  })
})

describe('objeto de revisión', () => {
  it('traduce la orden a la forma que consume el diálogo', () => {
    const item = buildPaymentValidationItem(order(), {
      athlete: { fullName: 'Ana Torres', documentId: '30111222' },
      detail: 'Pitbull Classic 2026',
      meta: '$ 170.000',
    })

    expect(item).toMatchObject({
      type: 'payment',
      mode: 'validate',
      paymentId: 'ord-1',
      hasProof: true,
      cashAtPitbull: false,
      allowApprovalWithoutProof: true,
      subject: 'Ana Torres',
      documentId: '30111222',
      detail: 'Pitbull Classic 2026',
      meta: '$ 170.000',
    })
  })

  it('marca efectivo en sede para que el diálogo no exija archivo', () => {
    const item = buildPaymentValidationItem(
      order({ manualPaymentChannel: 'cash_pitbull', paymentProofPath: null }),
      { athlete: { fullName: 'Ana Torres' } },
    )
    expect(item.cashAtPitbull).toBe(true)
    expect(item.hasProof).toBe(false)
  })

  it('conserva la decisión previa de rechazo', () => {
    const item = buildPaymentValidationItem(
      order({
        status: 'pendiente',
        rejectedBy: 'staff:finanzas@pluarg.com',
        rejectionReason: 'Monto distinto',
        rejectedAt: '2026-08-19T10:00:00.000Z',
      }),
      {},
    )
    expect(item.rejectedBy).toBe('staff:finanzas@pluarg.com')
    expect(item.rejectionReason).toBe('Monto distinto')
  })

  it('sin orden no arma nada', () => {
    expect(buildPaymentValidationItem(null, {})).toBeNull()
  })
})
