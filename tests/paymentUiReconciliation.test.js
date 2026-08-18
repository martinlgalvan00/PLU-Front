import { describe, expect, it } from 'vitest'
import { applyPaymentUpdate, paymentUpdateStatus } from '../src/services/paymentService.js'

describe('reconciliación visual de pagos', () => {
  it.each([
    ['approved', 'aprobado'],
    ['rejected', 'rechazado'],
    ['cancelled', 'cancelado'],
    ['refunded', 'reembolsado'],
    ['pending', 'pendiente'],
  ])('normaliza %s al estado de dominio %s', (providerStatus, domainStatus) => {
    expect(paymentUpdateStatus(providerStatus)).toBe(domainStatus)
  })

  it('actualiza la orden pública y emite sus entradas al acreditarse', () => {
    const order = { type: 'tickets', orderId: 'order-1', status: 'pendiente' }
    const tickets = [
      { id: 'ticket-1', orderId: 'order-1', status: 'pendiente_pago' },
      { id: 'ticket-2', orderId: 'otra-orden', status: 'pendiente_pago' },
    ]

    const result = applyPaymentUpdate(order, tickets, { orderId: 'order-1', status: 'approved' })

    expect(result.createdOrder.status).toBe('aprobado')
    expect(result.tickets).toEqual([
      { id: 'ticket-1', orderId: 'order-1', status: 'pagada' },
      tickets[1],
    ])
  })

  it('no acredita una orden distinta ni emite tickets ante pending', () => {
    const order = { orderId: 'order-1', status: 'pendiente' }
    const tickets = [{ id: 'ticket-1', orderId: 'order-1', status: 'pendiente_pago' }]

    expect(applyPaymentUpdate(order, tickets, { orderId: 'order-2', status: 'approved' })).toEqual({
      createdOrder: order,
      tickets,
    })
    expect(
      applyPaymentUpdate(order, tickets, { orderId: 'order-1', status: 'pending' }).tickets,
    ).toBe(tickets)
  })
})
