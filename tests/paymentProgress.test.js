import { describe, expect, it } from 'vitest'
import {
  canChangePaymentMethod,
  derivePaymentProgress,
  isPaymentActionable,
  paymentChannelOf,
  serializePaymentProgress,
} from '../src/lib/paymentProgress.js'

/**
 * El caso que motivó todo esto es real y está en la base: la orden
 * f336f4be-7f40-42b3-bf1d-2c506351cdd2 (afiliación, $85.000) tuvo un intento
 * rechazado por prevención de fraude a las 14:37, uno aprobado a las 21:27, y el
 * webhook del rechazado se reprocesó a las 21:42 — quince minutos DESPUÉS de que
 * la afiliación ya estaba activa.
 */
const ORDEN_REAL = {
  status: 'aprobado',
  method: 'mercado_pago',
  updatedAt: '2026-08-20T21:42:26.622Z',
}
const INTENTOS_REALES = [
  {
    external_payment_id: '173831512161',
    status: 'rechazado',
    status_detail: 'cc_rejected_high_risk',
    amount: 85000,
    confirmed_at: null,
    created_at: '2026-08-20T14:37:56.471Z',
    updated_at: '2026-08-20T21:42:26.622Z',
  },
  {
    external_payment_id: '174765196850',
    status: 'aprobado',
    status_detail: 'accredited',
    amount: 85000,
    confirmed_at: '2026-08-20T21:27:38.064Z',
    created_at: '2026-08-20T21:27:38.064Z',
    updated_at: '2026-08-20T21:27:38.064Z',
  },
]

describe('estado real de un cobro', () => {
  it('una orden aprobada con un intento rechazado posterior figura acreditada', () => {
    const progress = derivePaymentProgress({ order: ORDEN_REAL, attempts: INTENTOS_REALES })

    expect(progress.state).toBe('acreditado')
    expect(progress.tone).toBe('success')
    expect(progress.settled).toBe(true)
    // El rechazo no desaparece: deja de ser el estado y pasa a ser historial.
    expect(progress.failedAttempts).toBe(1)
    expect(progress.reasonCode).toBeNull()
    expect(progress.attempts).toHaveLength(2)
  })

  it('el intento más nuevo no manda: manda el aprobado', () => {
    // Invertir el orden de llegada no cambia el resultado. Elegir "el último"
    // era exactamente el criterio que reportaba rechazos sobre cobros hechos.
    const alReves = derivePaymentProgress({
      order: ORDEN_REAL,
      attempts: [...INTENTOS_REALES].reverse(),
    })
    expect(alReves.state).toBe('acreditado')
    expect(alReves.attempts.at(-1).status).toBe('rechazado')
  })

  it('sin intento aprobado, un rechazo sí es el estado y explica el motivo', () => {
    const progress = derivePaymentProgress({
      order: { status: 'rechazado', method: 'mercado_pago' },
      attempts: [INTENTOS_REALES[0]],
    })

    expect(progress.state).toBe('rechazado')
    expect(progress.tone).toBe('danger')
    expect(progress.reasonCode).toBe('cc_rejected_high_risk')
    expect(progress.action).toBe('retry')
  })

  it('distingue una orden vencida sin pagar de una rechazada por la organización', () => {
    const vencida = derivePaymentProgress({
      order: {
        status: 'cancelado',
        method: 'mercado_pago',
        expiresAt: '2026-08-20T14:53:00.000Z',
        updatedAt: '2026-08-20T14:54:00.000Z',
      },
    })
    expect(vencida.reasonCode).toBe('expired_without_attempt')
    expect(vencida.expiredAt).toBe('2026-08-20T14:53:00.000Z')

    const rechazadaPorStaff = derivePaymentProgress({
      order: {
        status: 'cancelado',
        method: 'manual_link',
        rejectionReason: 'El comprobante no coincide con el monto.',
      },
    })
    expect(rechazadaPorStaff.reasonCode).toBe('staff_rejected')
    expect(rechazadaPorStaff.reasonText).toBe('El comprobante no coincide con el monto.')
  })

  it('marca el desvío cuando hay plata acreditada y la orden no lo refleja', () => {
    // Nunca debería pasar (el agregado lo calcula la base sobre estas mismas
    // filas), pero si pasa la pantalla no puede decirle "rechazado" a alguien
    // que pagó.
    const progress = derivePaymentProgress({
      order: { status: 'cancelado', method: 'mercado_pago' },
      attempts: [INTENTOS_REALES[1]],
    })

    expect(progress.state).toBe('revision_pendiente')
    expect(progress.mismatch).toBe(true)
    expect(progress.tone).not.toBe('danger')
    expect(progress.action).toBe('wait')
  })
})

describe('progreso por canal', () => {
  it('la transferencia recorre comprobante y revisión; Mercado Pago no', () => {
    expect(
      derivePaymentProgress({
        order: { status: 'pendiente', method: 'manual_link', manualPaymentChannel: 'bank_transfer' },
      }).stages.map((stage) => stage.key),
    ).toEqual(['creada', 'comprobante', 'revision', 'acreditado'])

    expect(
      derivePaymentProgress({ order: { status: 'pendiente', method: 'mercado_pago' } }).stages.map(
        (stage) => stage.key,
      ),
    ).toEqual(['creada', 'pagando', 'acreditado'])
  })

  it('una transferencia sin comprobante pide el comprobante; con comprobante queda en revisión', () => {
    const sinComprobante = derivePaymentProgress({
      order: { status: 'pendiente', method: 'manual_link', manualPaymentChannel: 'bank_transfer' },
    })
    expect(sinComprobante.state).toBe('esperando_comprobante')
    expect(sinComprobante.action).toBe('upload_proof')

    const enRevision = derivePaymentProgress({
      order: {
        status: 'validacion_manual',
        method: 'manual_link',
        manualPaymentChannel: 'bank_transfer',
        paymentProofUploadedAt: '2026-08-20T15:00:00.000Z',
      },
    })
    expect(enRevision.state).toBe('en_revision')
    expect(enRevision.stages.find((stage) => stage.current).key).toBe('revision')
  })

  it('el efectivo en sede no espera comprobante', () => {
    const progress = derivePaymentProgress({
      order: { status: 'pendiente', method: 'manual_link', manualPaymentChannel: 'cash_pitbull' },
    })
    expect(progress.channel).toBe('cash_pitbull')
    expect(progress.state).toBe('esperando_pago_en_sede')
    expect(progress.action).toBe('pay')
    expect(progress.stages.map((stage) => stage.key)).toContain('pago_en_sede')
  })

  it('permite cambiar de medio mientras el cobro sigue abierto y sin evidencia en vuelo', () => {
    const mp = derivePaymentProgress({
      order: { status: 'pendiente', method: 'mercado_pago' },
    })
    expect(canChangePaymentMethod(mp)).toBe(true)
    expect(isPaymentActionable(mp)).toBe(true)

    const cash = derivePaymentProgress({
      order: { status: 'pendiente', method: 'manual_link', manualPaymentChannel: 'cash_pitbull' },
    })
    expect(canChangePaymentMethod(cash)).toBe(true)

    const sinComprobante = derivePaymentProgress({
      order: { status: 'pendiente', method: 'manual_link', manualPaymentChannel: 'bank_transfer' },
    })
    expect(canChangePaymentMethod(sinComprobante)).toBe(true)
    expect(isPaymentActionable(sinComprobante)).toBe(true)

    const enRevision = derivePaymentProgress({
      order: {
        status: 'validacion_manual',
        method: 'manual_link',
        manualPaymentChannel: 'bank_transfer',
        paymentProofUploadedAt: '2026-08-20T15:00:00.000Z',
      },
    })
    expect(canChangePaymentMethod(enRevision)).toBe(false)
    expect(isPaymentActionable(enRevision)).toBe(false)

    const procesando = derivePaymentProgress({
      order: { status: 'pendiente', method: 'mercado_pago' },
      attempts: [{ external_payment_id: '1', status: 'pendiente' }],
    })
    expect(procesando.state).toBe('procesando')
    expect(canChangePaymentMethod(procesando)).toBe(false)
  })

  it('una orden manual sin canal declarado se trata como transferencia', () => {
    expect(paymentChannelOf({ method: 'manual_link' })).toBe('bank_transfer')
  })
})

describe('forma de cable', () => {
  it('no expone nada del proveedor más allá del id, el estado y el motivo', () => {
    const wire = serializePaymentProgress(
      derivePaymentProgress({ order: ORDEN_REAL, attempts: INTENTOS_REALES }),
    )

    expect(Object.keys(wire.attempts[0]).sort()).toEqual(['amount', 'at', 'id', 'reasonCode', 'status'])
    expect(JSON.stringify(wire)).not.toContain('raw_payload')
  })
})

/**
 * Caso real de producción — Michelle Sofía Correa (20/08/2026).
 *
 * Su cuenta se contradecía sola: Afiliación decía "activa", Inscripciones
 * "cancelada" y Pagos "afiliación anual cancelada". Los tres decían la verdad,
 * pero sobre cosas distintas:
 *
 *   19:02  crea la orden de inscripción ($85.000, MP) — nunca la paga
 *   19:06  crea la orden de afiliación  ($85.000, MP) — nunca la paga
 *   19:33  el cron vence y cancela la inscripción (y arrastra la inscripción)
 *   19:39  el cron vence y cancela la afiliación
 *   23:35  un operador activa la afiliación a mano (`membership.activated_manually`)
 *
 * Mercado Pago no tiene un solo pago para ninguna de las dos órdenes: no hay
 * plata perdida. Lo que faltaba era decir por qué se canceló cada cobro y que
 * la afiliación se otorgó por otra vía.
 */
describe('cobro cancelado que igual terminó otorgado', () => {
  const ORDEN_AFILIACION = {
    status: 'cancelado',
    method: 'mercado_pago',
    expiresAt: '2026-08-20T19:36:32.131Z',
    updatedAt: '2026-08-20T19:39:00.100Z',
  }

  it('dice que venció sin ningún intento de pago, no un rechazo genérico', () => {
    const progress = derivePaymentProgress({ order: ORDEN_AFILIACION, attempts: [] })

    expect(progress.state).toBe('cancelado')
    expect(progress.reasonCode).toBe('expired_without_attempt')
    expect(progress.expiredAt).toBe('2026-08-20T19:36:32.131Z')
  })

  it('distingue "no llegó a pagar" de "intentó y falló"', () => {
    const conIntento = derivePaymentProgress({
      order: ORDEN_AFILIACION,
      attempts: [{ external_payment_id: '1', status: 'rechazado', status_detail: 'cc_rejected_high_risk' }],
    })

    expect(conIntento.reasonCode).toBe('expired_after_attempt')
    // Y arrastra el motivo del intento: por qué no entró.
    expect(conIntento.attemptReasonCode).toBe('cc_rejected_high_risk')
  })

  it('avisa que la afiliación quedó activa por otra vía en vez de contradecirla', () => {
    const progress = derivePaymentProgress({
      order: ORDEN_AFILIACION,
      attempts: [],
      outcome: { kind: 'membership', status: 'activa' },
    })

    expect(progress.resolvedElsewhere).toBe(true)
    expect(progress.outcome).toMatchObject({ kind: 'membership', granted: true })
  })

  it('la inscripción cancelada no se marca como resuelta por otra vía', () => {
    const progress = derivePaymentProgress({
      order: {
        status: 'cancelado',
        method: 'mercado_pago',
        expiresAt: '2026-08-20T19:32:54.160Z',
        updatedAt: '2026-08-20T19:33:00.100Z',
      },
      outcome: { kind: 'registration', status: 'cancelada' },
    })

    expect(progress.resolvedElsewhere).toBe(false)
    expect(progress.reasonCode).toBe('expired_without_attempt')
  })

  it('un cobro acreditado con su derecho otorgado no se marca como resuelto por otra vía', () => {
    // `resolvedElsewhere` es "el derecho existe A PESAR de que el cobro murió".
    // Con el cobro acreditado no hay nada que aclarar.
    const progress = derivePaymentProgress({
      order: { status: 'aprobado', method: 'mercado_pago' },
      attempts: [{ external_payment_id: '1', status: 'aprobado' }],
      outcome: { kind: 'membership', status: 'activa' },
    })

    expect(progress.resolvedElsewhere).toBe(false)
    expect(progress.outcome.granted).toBe(true)
  })
})
