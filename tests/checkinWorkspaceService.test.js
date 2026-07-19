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
  { id: 'reg-1', athleteId: 'ath-1', eventSlug: 'pitbull-2026', status: 'confirmada', competitionDay: 'day1' },
  { id: 'reg-2', athleteId: 'ath-2', eventSlug: 'otro-2026', status: 'confirmada', competitionDay: 'day2' },
]

const tickets = [
  { id: 'tkt-1', eventSlug: 'pitbull-2026', attendeeName: 'Ana', attendeeDni: '1', dayPass: 'both', status: 'pagada' },
  { id: 'tkt-2', eventSlug: 'otro-2026', attendeeName: 'Luis', attendeeDni: '2', dayPass: 'day2', status: 'pagada' },
  { id: 'tkt-legacy', attendeeName: 'Sin evento', attendeeDni: '3', dayPass: 'day1', status: 'pagada' },
]

describe('checkinWorkspaceService', () => {
  it('limita atletas y entradas al evento asignado', () => {
    const rows = buildCheckinRows({ athletes, registrations, tickets, eventSlug: 'pitbull-2026' })

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(['Martina Rivas', 'Ana']))
    expect(rows.map((row) => row.name)).not.toContain('Sin evento')
  })

  it('incluye los pases de ambos días en las vistas de día 1 y día 2', () => {
    const rows = buildCheckinRows({ athletes, registrations, tickets, eventSlug: 'pitbull-2026' })

    expect(filterCheckinRows(rows, { day: 'day1' })).toHaveLength(2)
    expect(filterCheckinRows(rows, { day: 'day2' })).toHaveLength(1)
  })

  it('resume personas listas, ingresadas y pendientes', () => {
    const summary = summarizeCheckinRows([
      { type: 'atleta', day: 'day1', status: 'pagada' },
      { type: 'espectador', day: 'both', status: 'usada' },
      { type: 'atleta', day: 'day2', status: 'pendiente_pago' },
    ])

    expect(summary).toMatchObject({ total: 3, ready: 1, done: 1, pending: 1, athletes: 2, spectators: 1 })
  })
})
