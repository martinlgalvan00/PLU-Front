import { describe, expect, it } from 'vitest'
import {
  formatPaymentOperationCardCopy,
  formatPaymentOperationType,
} from '../src/services/paymentOperationsDisplay.js'

const MESSAGES = {
  'admin.paymentOperations.reconciliation': 'Conciliación de pago',
  'admin.paymentOperations.eventType.payment': 'Cobro de Mercado Pago',
  'admin.paymentOperations.eventType.merchantOrder': 'Orden de Mercado Pago',
  'admin.paymentOperations.eventType.subscriptionPreapproval': 'Alta de suscripción',
  'admin.paymentOperations.eventType.subscriptionAuthorizedPayment': 'Cobro de suscripción',
  'admin.paymentOperations.orderKind.athlete': 'Afiliación o inscripción',
  'admin.paymentOperations.orderKind.ticket': 'Entrada',
  'admin.paymentOperations.eventAction.payment.created': 'aviso nuevo',
  'admin.paymentOperations.eventAction.payment.updated': 'actualización',
}

const t = (key) => MESSAGES[key] ?? key

describe('formatPaymentOperationType', () => {
  it('traduce el tipo crudo de Mercado Pago y el aviso', () => {
    expect(
      formatPaymentOperationType(
        { event_type: 'payment', action: 'payment.created', operationKind: 'webhook' },
        t,
      ),
    ).toBe('Cobro de Mercado Pago · aviso nuevo')
  })

  it('dice de qué es el cobro cuando hay order_kind', () => {
    expect(
      formatPaymentOperationType(
        {
          event_type: 'payment',
          action: 'payment.updated',
          operationKind: 'webhook',
          order_kind: 'ticket',
        },
        t,
      ),
    ).toBe('Cobro de Mercado Pago · Entrada · actualización')
  })

  it('nombra la conciliación con el concepto de la orden', () => {
    expect(
      formatPaymentOperationType(
        { operationKind: 'reconciliation', order_kind: 'athlete' },
        t,
      ),
    ).toBe('Conciliación de pago · Afiliación o inscripción')
  })

  it('deja el tipo tal cual si no está mapeado', () => {
    expect(formatPaymentOperationType({ event_type: 'chargebacks' }, t)).toBe('chargebacks')
  })

  it('devuelve un guión si no hay fila', () => {
    expect(formatPaymentOperationType(null, t)).toBe('—')
  })
})

describe('formatPaymentOperationCardCopy', () => {
  it('separa el tipo del aviso para la ficha compacta', () => {
    expect(
      formatPaymentOperationCardCopy(
        { event_type: 'payment', action: 'payment.updated', operationKind: 'webhook' },
        t,
      ),
    ).toEqual({
      headline: 'Cobro de Mercado Pago',
      context: 'actualización',
    })
  })
})
