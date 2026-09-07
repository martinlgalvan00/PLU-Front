import { describe, expect, it } from 'vitest'
import { isEventDayLocked } from '../src/components/admin/AdminEventDaysEditor.jsx'

const friday = { id: 'day-fri', dayIndex: 0, label: 'Viernes', date: '2026-12-11' }

describe('isEventDayLocked', () => {
  it('bloquea un día que ya tiene tandas por id', () => {
    expect(
      isEventDayLocked(friday, {
        sessions: [{ id: 's1', eventDayId: 'day-fri', dayIndex: 0 }],
      }),
    ).toBe(true)
  })

  it('bloquea un día con atletas asignados en la grilla', () => {
    expect(
      isEventDayLocked(friday, {
        scheduleDays: [{ id: 'day-fri', dayIndex: 0, assignedCount: 4 }],
      }),
    ).toBe(true)
  })

  it('bloquea por dayIndex cuando la tanda todavía no trae eventDayId', () => {
    expect(
      isEventDayLocked(
        { dayIndex: 1, label: 'Sábado' },
        { sessions: [{ id: 's1', dayIndex: 1 }] },
      ),
    ).toBe(true)
  })

  it('deja borrar un día vacío', () => {
    expect(
      isEventDayLocked(friday, {
        sessions: [{ id: 's1', eventDayId: 'day-sat', dayIndex: 1 }],
        scheduleDays: [{ id: 'day-fri', dayIndex: 0, assignedCount: 0 }],
      }),
    ).toBe(false)
  })
})
