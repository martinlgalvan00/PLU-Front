import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TICKET_REVEAL_LEAD_MINUTES,
  formatTicketRevealWhen,
  partitionTicketsByReveal,
  resolveTicketRevealLeadMinutes,
  ticketRevealLeadMinutesFromHours,
  ticketRevealState,
} from '../src/lib/ticketReveal.js'

const NOW = new Date('2026-11-02T15:00:00.000Z')

describe('ticketReveal', () => {
  it('habilita la vista 24 horas antes de validFrom', () => {
    const before = ticketRevealState(
      { valid_from: '2026-11-04T03:00:00.000Z' },
      DEFAULT_TICKET_REVEAL_LEAD_MINUTES,
      NOW,
    )
    expect(before.sealed).toBe(true)
    expect(before.revealAt).toBe('2026-11-03T03:00:00.000Z')

    const open = ticketRevealState(
      { valid_from: '2026-11-04T03:00:00.000Z' },
      DEFAULT_TICKET_REVEAL_LEAD_MINUTES,
      new Date('2026-11-03T03:00:00.000Z'),
    )
    expect(open.sealed).toBe(false)
  })

  it('con 0 horas se ve aunque la vigencia no haya empezado', () => {
    const state = ticketRevealState(
      { validFrom: '2099-01-02T03:00:00.000Z' },
      0,
      NOW,
    )
    expect(state.sealed).toBe(false)
    expect(state.revealAt).toBeNull()
  })

  it('una vigencia que ya empezó se ve', () => {
    const state = ticketRevealState(
      { valid_from: '2026-11-01T03:00:00.000Z' },
      DEFAULT_TICKET_REVEAL_LEAD_MINUTES,
      NOW,
    )
    expect(state.sealed).toBe(false)
  })

  it('sin validFrom no reserva el pase', () => {
    expect(ticketRevealState({ id: 'vieja' }, 1440, NOW).sealed).toBe(false)
  })

  it('cada entrada usa su propio validFrom', () => {
    const split = partitionTicketsByReveal(
      [
        { id: 'dia-1', valid_from: '2026-11-03T03:00:00.000Z' },
        { id: 'dia-2', valid_from: '2026-11-10T03:00:00.000Z' },
      ],
      { ticket_reveal_lead_minutes: 1440 },
      NOW,
    )
    expect(split.visible.map((entry) => entry.ticket.id)).toEqual(['dia-1'])
    expect(split.sealed.map((entry) => entry.ticket.id)).toEqual(['dia-2'])
    expect(split.revealComplete).toBe(false)
    expect(split.revealAt).toBe('2026-11-09T03:00:00.000Z')
  })

  it('sin dato del evento usa 24 horas y traduce horas a minutos', () => {
    expect(resolveTicketRevealLeadMinutes(null)).toBe(1440)
    expect(resolveTicketRevealLeadMinutes({ ticketRevealLeadMinutes: 0 })).toBe(0)
    expect(ticketRevealLeadMinutesFromHours(48)).toBe(48 * 60)
    expect(formatTicketRevealWhen('2026-11-03T03:00:00.000Z', 'es')).toContain('2026')
    expect(formatTicketRevealWhen('2026-11-03T03:00:00.000Z', 'es')).toContain('noviembre')
  })
})
