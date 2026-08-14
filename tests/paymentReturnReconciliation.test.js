import { describe, expect, it, vi } from 'vitest'
import { reconcileReturnPayment } from '../server/modules/payments/paymentWorkflow.js'

const ORDER = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'athlete',
  amount: 75000,
  currency: 'ARS',
  concept: 'membership',
  method: 'mercado_pago',
  status: 'pendiente',
}

const PAYMENT = {
  id: '123456789',
  external_reference: ORDER.id,
  status: 'approved',
  transaction_amount: ORDER.amount,
  currency_id: ORDER.currency,
  payer: { email: 'atleta@example.com' },
}

describe('conciliacion de retorno de Mercado Pago', () => {
  it('aplica el pago cuando Mercado Pago vuelve con paymentId', async () => {
    const repository = {
      applyPayment: vi.fn().mockResolvedValue({
        order: { ...ORDER, status: 'aprobado' },
      }),
    }
    const mercadoPago = {
      getPayment: vi.fn().mockResolvedValue(PAYMENT),
    }

    const result = await reconcileReturnPayment(
      { paymentOrderId: ORDER.id, paymentId: PAYMENT.id },
      { repository, mercadoPago, order: ORDER },
    )

    expect(mercadoPago.getPayment).toHaveBeenCalledWith(PAYMENT.id)
    expect(repository.applyPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: ORDER.id,
      externalPaymentId: PAYMENT.id,
      status: 'aprobado',
      orderKind: 'athlete',
    }))
    expect(result).toMatchObject({
      reconciled: true,
      order: { status: 'aprobado' },
    })
  })

  it('busca por external_reference cuando el retorno no trae paymentId', async () => {
    const repository = {
      applyPayment: vi.fn().mockResolvedValue({
        order: { ...ORDER, status: 'aprobado' },
      }),
    }
    const mercadoPago = {
      findPaymentForOrder: vi.fn().mockResolvedValue(PAYMENT),
    }

    await reconcileReturnPayment(
      { paymentOrderId: ORDER.id },
      { repository, mercadoPago, order: ORDER },
    )

    expect(mercadoPago.findPaymentForOrder).toHaveBeenCalledWith(ORDER)
    expect(repository.applyPayment).toHaveBeenCalled()
  })
})
