import { describe, expect, it } from 'vitest'
import {
  buildCheckinRows,
  filterCheckinRows,
  formatCheckinRowDay,
  mapAllowlistToCheckinSources,
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

  it('la fila de una entrada lleva la credencial concreta', () => {
    const rows = buildCheckinRows({
      athletes: [],
      registrations: [],
      tickets: [
        {
          id: 'tkt-coach-a',
          eventSlug: 'pitbull-2026',
          attendeeName: 'Nora Coach',
          attendeeDni: '41333444',
          ticketTypeId: 'both-type',
          ticketTypeName: 'Entrenadores',
          credentialLabel: 'ENTRENADOR',
          status: 'pagada',
        },
      ],
      eventSlug: 'pitbull-2026',
      ticketTypes,
    })

    expect(rows[0].credentialLabel).toBe('ENTRENADOR')
    expect(filterCheckinRows(rows, { query: 'entrenador' })).toHaveLength(1)
    expect(filterCheckinRows(rows, { type: 'coach' })).toHaveLength(1)
    expect(filterCheckinRows(rows, { credential: 'ENTRENADOR' })).toHaveLength(1)
    expect(filterCheckinRows(rows, { credential: 'VIP' })).toHaveLength(0)
  })

  it('arma atletas y entradas desde la allowlist de puerta', () => {
    const sources = mapAllowlistToCheckinSources(
      {
        tickets: [
          {
            qrToken: 'qr-1',
            ticketCode: 'T-1',
            attendeeName: 'Nora Coach',
            attendeeDni: '41333444',
            ticketTypeName: 'Entrenadores',
            credentialLabel: 'ENTRENADOR',
            status: 'pagada',
          },
        ],
        registrations: [
          {
            registrationId: 'reg-9',
            athleteName: 'Martina Rivas',
            athleteDocument: '40111222',
            category: 'Raw',
            division: 'Open',
            status: 'confirmada',
          },
        ],
      },
      'pitbull-2026',
    )
    const rows = buildCheckinRows({ ...sources, eventSlug: 'pitbull-2026', ticketTypes })
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Martina Rivas', 'Nora Coach']),
    )
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

describe('formatCheckinRowDay', () => {
  const t = (key) =>
    ({
      'admin.checkin.scheduleUnassigned': 'Día a confirmar',
      'admin.checkin.bothDays': 'Ambos',
    })[key] ?? key

  it('nombra el día de la grilla y deja claro cuando no hay asignación', () => {
    expect(formatCheckinRowDay({ type: 'atleta', dayIndexes: 'all' }, eventDays, t)).toBe(
      'Día a confirmar',
    )
    expect(formatCheckinRowDay({ type: 'espectador', dayIndexes: [0, 1] }, eventDays, t)).toBe(
      'Día 1 · Día 2',
    )
  })
})
