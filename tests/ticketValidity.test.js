import { describe, expect, it } from 'vitest'
import {
  TICKET_VALIDITY_WARNING_MS,
  TICKET_VALIDITY_STATUS,
  ticketIsCurrentlyValid,
  ticketValidityStatus,
  ticketValidityTiming,
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

  it('vence al cumplirse las 12 horas desde la acreditación', () => {
    // La base guarda este snapshot al acreditarse: 09:30 + 720 minutos. El
    // extremo superior es exclusivo, así que el QR deja de habilitar justo en
    // ese instante, no una hora después ni al terminar el día.
    const twelveHourTicket = {
      validFrom: '2026-08-15T12:30:00.000Z',
      validUntil: '2026-08-16T00:30:00.000Z',
    }

    expect(ticketValidityStatus(twelveHourTicket, '2026-08-16T00:29:59.999Z')).toBe(
      TICKET_VALIDITY_STATUS.VALID,
    )
    expect(ticketValidityStatus(twelveHourTicket, '2026-08-16T00:30:00.000Z')).toBe(
      TICKET_VALIDITY_STATUS.EXPIRED,
    )
    expect(ticketIsCurrentlyValid(twelveHourTicket, '2026-08-16T00:30:00.001Z')).toBe(false)
  })

  it('advierte a Seguridad antes de vencer, pero no concede minutos de gracia', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const nearlyExpired = {
      validFrom: '2026-08-15T10:00:00.000Z',
      validUntil: '2026-08-15T12:01:00.000Z',
    }

    expect(ticketValidityTiming(nearlyExpired, now)).toMatchObject({
      status: TICKET_VALIDITY_STATUS.VALID,
      remainingMs: 60_000,
      isExpiringSoon: true,
    })
    expect(TICKET_VALIDITY_WARNING_MS).toBe(15 * 60 * 1000)

    expect(ticketValidityTiming(nearlyExpired, '2026-08-15T12:02:00.000Z')).toMatchObject({
      status: TICKET_VALIDITY_STATUS.EXPIRED,
      expiredForMs: 60_000,
      remainingMs: 0,
      isExpiringSoon: false,
    })
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
