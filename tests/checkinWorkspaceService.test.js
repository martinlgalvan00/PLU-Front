import { describe, expect, it } from 'vitest'
import {
  buildCheckinRows,
  filterCheckinRows,
  summarizeCheckinRows,
} from '../src/services/checkinWorkspaceService.js'

const athletes = [
  { id: 'ath-1', fullName: 'Martina Rivas', documentId: '40111222' },
  { id: 'ath-2', fullName: 'Nicolás Aguirre', documentId: '36888999' },
]

const registrations = [
  { id: 'reg-1', athleteId: 'ath-1', eventSlug: 'pitbull-2026', status: 'confirmada' },
  { id: 'reg-2', athleteId: 'ath-2', eventSlug: 'otro-2026', status: 'confirmada' },
]

const eventDays = [
  { dayIndex: 0, label: 'Día 1' },
  { dayIndex: 1, label: 'Día 2' },
]

const ticketTypes = [
  { id: 'both-type', dayIndexes: [0, 1] },
  { id: 'day1-type', dayIndexes: [0] },
  { id: 'day2-type', dayIndexes: [1] },
]

const tickets = [
  {
    id: 'tkt-1',
    eventSlug: 'pitbull-2026',
    attendeeName: 'Ana',
    attendeeDni: '1',
    ticketTypeId: 'both-type',
    status: 'pagada',
  },
  {
    id: 'tkt-1b',
    eventSlug: 'pitbull-2026',
    attendeeName: 'Bruno',
    attendeeDni: '4',
    ticketTypeId: 'day1-type',
    status: 'pagada',
  },
  {
    id: 'tkt-2',
    eventSlug: 'otro-2026',
    attendeeName: 'Luis',
    attendeeDni: '2',
    ticketTypeId: 'day2-type',
    status: 'pagada',
  },
  {
    id: 'tkt-legacy',
    attendeeName: 'Sin evento',
    attendeeDni: '3',
    ticketTypeId: 'day1-type',
    status: 'pagada',
  },
]

describe('checkinWorkspaceService', () => {
  it('limita atletas y entradas al evento asignado', () => {
    const rows = buildCheckinRows({
      athletes,
      registrations,
      tickets,
      eventSlug: 'pitbull-2026',
      ticketTypes,
    })

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Martina Rivas', 'Ana', 'Bruno']),
    )
    expect(rows.map((row) => row.name)).not.toContain('Sin evento')
  })

  it('resuelve el día de acceso de cada ticket vía su tipo de entrada', () => {
    const rows = buildCheckinRows({
      athletes,
      registrations,
      tickets,
      eventSlug: 'pitbull-2026',
      ticketTypes,
    })

    // Martina (inscripción de atleta) cubre todo el evento; Ana (pase ambos
    // días) matchea los dos días; Bruno (pase día 1) solo matchea el día 0.
    expect(filterCheckinRows(rows, { day: 0 })).toHaveLength(3)
    expect(filterCheckinRows(rows, { day: 1 })).toHaveLength(2)
    expect(filterCheckinRows(rows, { day: 1 }).map((row) => row.name)).not.toContain('Bruno')
  })

  it('resume personas listas, ingresadas y pendientes por día', () => {
    const rows = [
      { type: 'atleta', dayIndexes: 'all', status: 'pagada' },
      { type: 'espectador', dayIndexes: [0, 1], status: 'usada' },
      { type: 'atleta', dayIndexes: 'all', status: 'pendiente_pago' },
    ]
    const summary = summarizeCheckinRows(rows, eventDays)

    expect(summary).toMatchObject({
      total: 3,
      ready: 1,
      done: 1,
      pending: 1,
      athletes: 2,
      spectators: 1,
      byDay: { 0: 3, 1: 3 },
    })
  })
})
