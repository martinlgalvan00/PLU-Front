import { describe, expect, it } from 'vitest'
import {
  compareAthletes,
  compositionFacets,
  DEFAULT_FLIGHT_SIZE,
  groupAthletes,
  matchesFacet,
  matchesQuery,
  nextSessionName,
  planEventBoard,
  resolvePlacementBatches,
  sessionsPayloadFromBoard,
  summarizeComposition,
} from '../src/services/eventBoardPlanner.js'

function athlete(id, overrides = {}) {
  return {
    registrationId: id,
    athleteId: `ath-${id}`,
    fullName: overrides.fullName ?? id,
    gym: 'Iron',
    division: 'Open',
    category: 'Raw',
    bodyweightKg: 63,
    sex: 'Femenino',
    ...overrides,
  }
}

function emptyDay(dayIndex, sessions = []) {
  return {
    id: `day-${dayIndex}`,
    dayIndex,
    label: `Día ${dayIndex + 1}`,
    sessions,
    withoutSession: [],
  }
}

function session(id, name, athletes = []) {
  return { id, name, platform: '', weighInAt: null, startsAt: null, sortOrder: 0, athletes }
}

describe('eventBoardPlanner', () => {
  it('ordena femenino antes que masculino y después por equipo, división y peso', () => {
    const ordered = [
      athlete('m', { sex: 'Masculino', bodyweightKg: 83 }),
      athlete('f-heavy', { sex: 'Femenino', bodyweightKg: 84 }),
      athlete('f-light', { sex: 'Femenino', bodyweightKg: 52 }),
      athlete('unknown', { sex: null, fullName: 'Zeta' }),
    ].sort(compareAthletes)

    expect(ordered.map((row) => row.registrationId)).toEqual(['f-light', 'f-heavy', 'm', 'unknown'])
  })

  it('nombra la siguiente tanda sin chocar con las existentes', () => {
    expect(nextSessionName(['Tanda A', 'tanda c'])).toBe('Tanda B')
    expect(nextSessionName(['Tanda A', 'Tanda B', 'Tanda C'])).toBe('Tanda D')
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Tanda ${letter}`)
    expect(nextSessionName(letters)).toBe('Tanda 27')
  })

  it('llena tandas existentes sin mezclar sexos ni pisar a los que ya están', () => {
    const alreadyThere = athlete('placed', { sex: 'Femenino', bodyweightKg: 52 })
    const plan = planEventBoard({
      maxPerSession: 3,
      unassigned: [
        athlete('ana', { sex: 'Femenino', bodyweightKg: 57, fullName: 'Ana' }),
        athlete('luis', { sex: 'Masculino', bodyweightKg: 83, fullName: 'Luis' }),
      ],
      days: [
        emptyDay(0, [session('ses-a', 'Tanda A', [alreadyThere])]),
        emptyDay(1, [session('ses-g', 'Tanda G', [])]),
      ],
    })

    const ana = plan.placements.find((row) => row.registrationId === 'ana')
    const luis = plan.placements.find((row) => row.registrationId === 'luis')
    expect(ana.sessionId).toBe('ses-a')
    expect(luis.sessionId).toBe('ses-g')
    expect(plan.newSessions).toEqual([])
    expect(plan.placements.some((row) => row.registrationId === 'placed')).toBe(false)
  })

  it('no parte un grupo de mismo peso salvo que exceda el tope', () => {
    const sameClass = [1, 2, 3, 4].map((index) =>
      athlete(`f-${index}`, { sex: 'Femenino', bodyweightKg: 57, fullName: `F${index}` }),
    )
    const plan = planEventBoard({
      maxPerSession: 3,
      unassigned: sameClass,
      days: [emptyDay(0, [])],
    })

    expect(plan.newSessions).toHaveLength(2)
    expect(plan.newSessions[0].count).toBe(3)
    expect(plan.newSessions[1].count).toBe(1)
    expect(plan.newSessions[0].name).toBe('Tanda A')
  })

  it('propone tandas nuevas en round-robin entre los días', () => {
    const women = [1, 2].map((index) =>
      athlete(`f-${index}`, { sex: 'Femenino', bodyweightKg: 52, fullName: `F${index}` }),
    )
    const men = [1, 2].map((index) =>
      athlete(`m-${index}`, { sex: 'Masculino', bodyweightKg: 83, fullName: `M${index}` }),
    )
    const plan = planEventBoard({
      maxPerSession: 12,
      unassigned: [...women, ...men],
      days: [emptyDay(0, []), emptyDay(1, [])],
    })

    expect(plan.newSessions).toHaveLength(2)
    expect(plan.newSessions[0].dayIndex).toBe(0)
    expect(plan.newSessions[1].dayIndex).toBe(1)
    expect(plan.leftover).toEqual([])
    expect(plan.placed).toBe(4)
  })

  it('resume la composición de una tanda homogénea', () => {
    expect(
      summarizeComposition([
        athlete('a', { sex: 'Femenino', category: 'Raw', division: 'Junior', bodyweightKg: 52 }),
        athlete('b', { sex: 'Femenino', category: 'Raw', division: 'Junior', bodyweightKg: 57 }),
      ]),
    ).toBe('Femenino · Raw · Junior · 52–57 kg')
  })

  it('agrupa el pool por sexo, equipo y división', () => {
    const groups = groupAthletes([
      athlete('a', { sex: 'Femenino', division: 'Junior' }),
      athlete('b', { sex: 'Masculino', division: 'Open' }),
      athlete('c', { sex: 'Femenino', division: 'Junior', bodyweightKg: 69 }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].athletes).toHaveLength(2)
    expect(groups[0].sex).toBe('Femenino')
  })

  it('arma facets y filtra por chip o búsqueda', () => {
    const athletes = [
      athlete('ana', { sex: 'Femenino', fullName: 'Ana Torres', gym: 'Barra Fija' }),
      athlete('luis', { sex: 'Masculino', fullName: 'Luis Ferro', gym: 'Sur' }),
    ]
    const facets = compositionFacets(athletes)
    expect(facets.sex).toEqual([
      { value: 'Femenino', count: 1 },
      { value: 'Masculino', count: 1 },
    ])
    expect(matchesFacet(athletes[0], { kind: 'sex', value: 'Femenino' })).toBe(true)
    expect(matchesFacet(athletes[1], { kind: 'sex', value: 'Femenino' })).toBe(false)
    expect(matchesQuery(athletes[0], 'barra')).toBe(true)
    expect(matchesQuery(athletes[1], 'barra')).toBe(false)
  })

  it('el payload de tandas manda el set completo y omite las borradas', () => {
    const days = [
      emptyDay(0, [session('ses-a', 'Tanda A'), session('ses-b', 'Tanda B')]),
      emptyDay(1, [session('ses-g', 'Tanda G')]),
    ]
    const payload = sessionsPayloadFromBoard(days, {
      omitIds: ['ses-b'],
      extra: [{ dayIndex: 1, name: 'Tanda C' }],
    })
    expect(payload.map((row) => row.name)).toEqual(['Tanda A', 'Tanda G', 'Tanda C'])
    expect(payload[2].id).toBeUndefined()
    expect(payload[2].dayIndex).toBe(1)
  })

  it('resuelve tandas nuevas por nombre después de persistirlas', () => {
    const plan = {
      placements: [
        { registrationId: 'ana', dayIndex: 0, sessionId: 'ses-a', sessionName: 'Tanda A' },
        { registrationId: 'luis', dayIndex: 1, sessionId: null, sessionName: 'Tanda B' },
      ],
    }
    const board = {
      days: [
        emptyDay(0, [session('ses-a', 'Tanda A')]),
        emptyDay(1, [session('ses-b-real', 'Tanda B')]),
      ],
    }
    const { batches, unresolved } = resolvePlacementBatches(board, plan)
    expect(unresolved).toEqual([])
    expect(batches).toEqual([
      { dayIndex: 0, sessionId: 'ses-a', registrationIds: ['ana'] },
      { dayIndex: 1, sessionId: 'ses-b-real', registrationIds: ['luis'] },
    ])
  })

  it('el tope por defecto es 12', () => {
    expect(DEFAULT_FLIGHT_SIZE).toBe(12)
  })
})
