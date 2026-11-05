import { describe, expect, it } from 'vitest'
import { ticketOrderAwaitingPayment, ticketPassWatchMode } from '../src/services/ticketPassWatch.js'

const token = 'a'.repeat(40)

describe('seguimiento de la entrada después de pagar', () => {
  it('espera la acreditación de una transferencia y cierra cuando ya hay QR', () => {
    expect(
      ticketPassWatchMode({
        type: 'tickets',
        orderId: 'order-1',
        orderAccessToken: token,
        status: 'pendiente',
      }),
    ).toBe('watch')
    expect(
      ticketPassWatchMode({
        type: 'tickets',
        orderId: 'order-1',
        orderAccessToken: token,
        status: 'aprobado',
      }),
    ).toBe('settle')
    expect(
      ticketPassWatchMode({
        type: 'tickets',
        orderId: 'order-1',
        orderAccessToken: token,
        status: 'aprobado',
        passFresh: true,
      }),
    ).toBeNull()
    expect(ticketOrderAwaitingPayment('pendiente')).toBe(true)
    expect(ticketOrderAwaitingPayment('rechazado')).toBe(false)
    expect(ticketOrderAwaitingPayment('aprobado')).toBe(false)
  })
})
