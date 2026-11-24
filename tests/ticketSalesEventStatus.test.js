import { describe, expect, it } from 'vitest'
import { eventStatusClosesTicketSales, isTicketSalesEnabled } from '../src/lib/eventPricing.js'
import { withPublicEventStatus } from '../src/lib/publicRegistrationPhase.js'

const pricing = { ticketsEnabled: true }

describe('la venta de entradas es independiente del estado de inscripción', () => {
  it('cerrado mantiene la venta; finalizado la corta aunque el interruptor esté prendido', () => {
    expect(isTicketSalesEnabled({ pricing, status: 'inscripcion_abierta' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'cupos_limitados' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'agotado' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'cerrado' })).toBe(true)
    expect(isTicketSalesEnabled({ pricing, status: 'finalizado' })).toBe(false)
    expect(eventStatusClosesTicketSales({ status: 'cerrado' })).toBe(false)
    expect(eventStatusClosesTicketSales({ status: 'finalizado' })).toBe(true)
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

  it('un cierre guardado de inscripción no corta la venta de entradas', () => {
    expect(isTicketSalesEnabled({ pricing, status: 'cerrado', storedStatus: 'cerrado' })).toBe(true)
  })
})
