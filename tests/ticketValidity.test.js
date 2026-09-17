import { describe, expect, it } from 'vitest'
import {
  TICKET_VALIDITY_STATUS,
  ticketIsCurrentlyValid,
  ticketValidityStatus,
} from '../src/lib/ticketValidity.js'

const ticket = {
  validFrom: '2026-08-15T03:00:00.000Z',
  validUntil: '2026-08-16T03:00:00.000Z',
}

describe('vigencia inmutable del QR de entrada', () => {
  it('es válida durante el día asignado', () => {
    expect(ticketValidityStatus(ticket, '2026-08-15T18:00:00.000Z')).toBe(
      TICKET_VALIDITY_STATUS.VALID,
    )
  })

  it('vence exactamente al comenzar el día siguiente', () => {
    expect(ticketValidityStatus(ticket, ticket.validUntil)).toBe(TICKET_VALIDITY_STATUS.EXPIRED)
    expect(ticketIsCurrentlyValid(ticket, ticket.validUntil)).toBe(false)
  })

  it('distingue una entrada que todavía no empezó', () => {
    expect(ticketValidityStatus(ticket, '2026-08-15T02:59:59.999Z')).toBe(
      TICKET_VALIDITY_STATUS.UPCOMING,
    )
  })

  it('mantiene compatibilidad con entradas viejas sin ventana congelada', () => {
    expect(ticketValidityStatus({})).toBe(TICKET_VALIDITY_STATUS.UNKNOWN)
    expect(ticketIsCurrentlyValid({})).toBe(true)
  })
})
