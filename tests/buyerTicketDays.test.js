import { describe, expect, it } from 'vitest'
import {
  accessDaysFromValidityWindow,
  collectBuyerTicketDayFilters,
  describeBuyerTicketDays,
  lookupTicketAccessDays,
} from '../src/lib/buyerTicketDays.js'

describe('jornadas que ve el comprador', () => {
  it('usa las jornadas del tipo y no las parte en un QR por día', () => {
    const ticket = {
      id: 't1',
      accessDays: [
        { label: 'Domingo', date: '2026-12-13', dayIndex: 1 },
        { label: 'Sábado', date: '2026-12-12', dayIndex: 0 },
      ],
    }
    const described = describeBuyerTicketDays(ticket, { locale: 'es' })
    expect(described.source).toBe('ticket')
    expect(described.days.map((day) => day.date)).toEqual(['2026-12-12', '2026-12-13'])
    expect(described.label).toContain('Sábado')
    expect(described.label).toContain('Domingo')
    expect(collectBuyerTicketDayFilters([ticket], { locale: 'es' })).toHaveLength(2)
  })

  it('toma las jornadas del catálogo si la entrada todavía no las trae', () => {
    const described = describeBuyerTicketDays(
      { ticketTypeId: 'type-1' },
      {
        locale: 'es',
        catalogTypes: [
          {
            id: 'type-1',
            accessDays: [{ label: 'Sábado', date: '2026-12-12', dayIndex: 0 }],
          },
        ],
      },
    )
    expect(described.source).toBe('catalog')
    expect(described.days[0].key).toBe('2026-12-12')
  })

  it('cae a la ventana congelada y no incluye el día en que vence', () => {
    const ticket = {
      validFrom: '2026-08-15T03:00:00.000Z',
      validUntil: '2026-08-16T03:00:00.000Z',
    }
    expect(accessDaysFromValidityWindow(ticket).map((day) => day.date)).toEqual(['2026-08-15'])
    const described = describeBuyerTicketDays(ticket, { locale: 'es' })
    expect(described.source).toBe('window')
    expect(described.label).toMatch(/15/)
    expect(described.label).not.toMatch(/16/)
  })

  it('lee el embed de jornadas del lookup y lo ordena', () => {
    const days = lookupTicketAccessDays({
      ticket_types: {
        name: 'General',
        ticket_type_days: [
          { event_days: { label: 'Domingo', date: '2026-12-13', day_index: 1 } },
          { event_days: { label: 'Sábado', date: '2026-12-12', day_index: 0 } },
        ],
      },
    })
    expect(days.map((day) => day.day_index)).toEqual([0, 1])
  })
})
