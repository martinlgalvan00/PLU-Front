import { describe, expect, it, vi } from 'vitest'
import { createPaymentNotificationService } from '../server/modules/notifications/paymentNotificationService.js'
import { applyCanonicalPayment } from '../server/modules/payments/paymentWorkflow.js'

/**
 * Regresión del caso real de producción (orden f336f4be, 20/08/2026):
 *
 *   14:37  pago 173831512161 → `pending`  → email "pago pendiente"
 *   21:27  pago 174765196850 → `approved` → orden aprobada, comprobante enviado
 *   21:42  el webhook de 173831512161 se reprocesa, ahora `rejected`
 *          → salía "no pudimos procesar tu pago" a una socia ya activa
 *
 * El intento tardío no cambia el hecho: el estado de la orden es el agregado de
 * todos sus intentos, y con uno aprobado la orden está aprobada. La notificación
 * ahora se decide con ese agregado, no con el intento suelto.
 */
const ORDEN = {
  id: 'f336f4be-7f40-42b3-bf1d-2c506351cdd2',
  kind: 'athlete',
  concept: 'membership',
  amount: 85000,
  currency: 'ARS',
  method: 'mercado_pago',
  status: 'aprobado',
  reference: 'MORD-007fe4e3016a3dad',
  displayConcept: 'Afiliación PLU anual 2026',
  payerEmail: 'jack.labadie@example.com',
  athlete: { full_name: 'María Jacqueline', email: 'cuenta@example.com' },
}

const PAGO_RECHAZADO_TARDIO = {
  id: '173831512161',
  external_reference: ORDEN.id,
  status: 'rejected',
  status_detail: 'cc_rejected_high_risk',
  transaction_amount: 85000,
  currency_id: 'ARS',
  payer: { email: 'jack.labadie@example.com' },
}

function notificador() {
  const send = vi.fn().mockResolvedValue({ status: 'sent' })
  return {
    send,
    notify: createPaymentNotificationService({ dispatcher: { configured: true, send }, env: {} }),
  }
}

describe('intento superado por el estado de la orden', () => {
  it('no avisa un rechazo sobre una orden que ya quedó aprobada', async () => {
    const { send, notify } = notificador()

    await notify({
      order: ORDEN,
      payment: { status: 'rechazado', externalPaymentId: '173831512161', amount: 85000 },
      result: { order: { status: 'aprobado' } },
      orderStatus: 'aprobado',
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('tampoco avisa "pago pendiente" si la orden ya está aprobada', async () => {
    const { send, notify } = notificador()

    await notify({
      order: ORDEN,
      payment: { status: 'pendiente', externalPaymentId: '173831512161', amount: 85000 },
      result: { order: { status: 'aprobado' } },
      orderStatus: 'aprobado',
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('sí avisa el rechazo cuando la orden efectivamente quedó rechazada', async () => {
    const { send, notify } = notificador()

    await notify({
      order: { ...ORDEN, status: 'rechazado' },
      payment: {
        status: 'rechazado',
        externalPaymentId: '173831512161',
        amount: 85000,
        statusDetail: 'cc_rejected_high_risk',
      },
      result: { order: { status: 'rechazado' } },
      orderStatus: 'rechazado',
    })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('payment_rejected')
  })

  it('un reembolso siempre avisa: la plata se movió de verdad', async () => {
    const { send, notify } = notificador()

    await notify({
      order: ORDEN,
      payment: { status: 'reembolsado', externalPaymentId: '174765196850', amount: 85000 },
      result: { order: { status: 'reembolsado' } },
      orderStatus: 'reembolsado',
    })

    expect(send.mock.calls.map(([type]) => type)).toContain('payment_refunded')
  })

  it('el aviso va a la cuenta del atleta, no al pagador del intento fallido', async () => {
    // `athlete_payment_orders.payer_email` lo pisa el último intento aplicado:
    // el rechazo de producción se mandó a la dirección de Mercado Pago del
    // intento fallido en vez de a la cuenta dueña de la afiliación.
    const { send, notify } = notificador()

    await notify({
      order: { ...ORDEN, status: 'rechazado' },
      payment: { status: 'rechazado', externalPaymentId: '173831512161', amount: 85000 },
      result: { order: { status: 'rechazado' } },
      orderStatus: 'rechazado',
    })

    expect(send.mock.calls[0][1].to).toBe('cuenta@example.com')
  })

  it('applyCanonicalPayment le pasa a la notificación el estado resultante de la orden', async () => {
    const notifyPaymentApplied = vi.fn().mockResolvedValue([])
    const repository = {
      applyPayment: vi.fn().mockResolvedValue({ order: { ...ORDEN, status: 'aprobado' } }),
    }

    await applyCanonicalPayment(PAGO_RECHAZADO_TARDIO, ORDEN, {
      repository,
      notifyPaymentApplied,
      stage: 'webhook',
    })

    // El asiento en el ledger se hace igual — el intento existió y se registra.
    expect(repository.applyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rechazado', externalPaymentId: '173831512161' }),
    )
    // Pero la notificación recibe el agregado, que es lo que decide si avisa.
    expect(notifyPaymentApplied).toHaveBeenCalledWith(
      expect.objectContaining({ orderStatus: 'aprobado' }),
    )
  })
})
