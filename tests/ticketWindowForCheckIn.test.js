import { describe, expect, it } from 'vitest'
import { ticketWindowForCheckIn } from '../server/modules/ticketing/supabaseTicketRepository.js'

const row = {
  id: 'ticket-1',
  event_id: 'event-1',
  valid_from: '2026-12-01T00:00:00.000Z',
  valid_until: '2026-12-02T00:00:00.000Z',
  access_override_enabled: false,
  access_override_valid_from: null,
  access_override_valid_until: null,
}

describe('ticketWindowForCheckIn', () => {
  it('usa la vigencia congelada cuando no hay excepción', () => {
    expect(ticketWindowForCheckIn(row)).toEqual({
      id: 'ticket-1',
      event_id: 'event-1',
      status: null,
      valid_from: '2026-12-01T00:00:00.000Z',
      valid_until: '2026-12-02T00:00:00.000Z',
    })
  })

  it('pisa la vigencia congelada con la excepción de acceso', () => {
    expect(
      ticketWindowForCheckIn({
        ...row,
        access_override_enabled: true,
        access_override_valid_from: '2026-11-03T12:00:00.000Z',
        access_override_valid_until: '2026-11-04T12:00:00.000Z',
      }),
    ).toEqual({
      id: 'ticket-1',
      event_id: 'event-1',
      status: null,
      valid_from: '2026-11-03T12:00:00.000Z',
      valid_until: '2026-11-04T12:00:00.000Z',
    })
  })

  it('no inventa una excepción si falta una punta de la ventana', () => {
    expect(
      ticketWindowForCheckIn({
        ...row,
        access_override_enabled: true,
        access_override_valid_from: '2026-11-03T12:00:00.000Z',
        access_override_valid_until: null,
      }).valid_from,
    ).toBe('2026-12-01T00:00:00.000Z')
  })
})
