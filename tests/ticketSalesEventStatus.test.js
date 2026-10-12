import { describe, expect, it } from 'vitest'
import { eventStatusClosesTicketSales, isTicketSalesEnabled } from '../src/lib/eventPricing.js'
import { withPublicEventStatus } from '../src/lib/publicRegistrationPhase.js'

const pricing = { ticketsEnabled: true }

describe('la venta de entradas sigue el estado del evento, como el servidor', () => {
  it('cerrado y finalizado no venden aunque el interruptor del evento esté prendido', () => {
    expect(isTicketSalesEnabled({ pricing, status: 'inscripcion_abierta' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'cupos_limitados' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'agotado' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'cerrado' })).toBe(false)
    expect(isTicketSalesEnabled({ pricing, status: 'finalizado' })).toBe(false)
    expect(eventStatusClosesTicketSales({ status: 'cerrado' })).toBe(true)
  })

  it('un evento sin estado sigue como antes: lo decide el interruptor', () => {
    expect(isTicketSalesEnabled({ pricing })).toBe(true)
    expect(isTicketSalesEnabled({})).toBe(false)
  })

  it('que venza la ventana de inscripción de atletas no corta las entradas', () => {
    const now = new Date('2026-11-01T12:00:00-03:00')
    const event = withPublicEventStatus(
      {
        pricing,
        status: 'inscripcion_abierta',
        registrationClosesAt: '2026-10-31T23:59:00-03:00',
      },
      now,
    )

    expect(event.status).toBe('cerrado')
    expect(event.storedStatus).toBe('inscripcion_abierta')
    expect(isTicketSalesEnabled(event)).toBe(true)
  })

  it('si el estado guardado ya es cerrado, las entradas se cortan aunque se derive otro', () => {
    expect(isTicketSalesEnabled({ pricing, status: 'cerrado', storedStatus: 'cerrado' })).toBe(false)
  })
})
