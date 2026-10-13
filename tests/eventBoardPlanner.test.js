import { describe, expect, it } from 'vitest'
import {
  compareAthletes,
  compositionFacets,
  DEFAULT_FLIGHT_SIZE,
  EMPTY_POOL_FILTERS,
  formatAgeRange,
  groupAthletes,
  hasActivePoolFilters,
  matchesFacet,
  matchesPoolFilters,
  matchesQuery,
  nextSessionName,
  planEventBoard,
  resolvePlacementBatches,
  sessionStats,
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

  it('resume el rango de edad solo con quienes cargaron nacimiento', () => {
    expect(formatAgeRange([athlete('a', { age: 19 }), athlete('b', { age: 23 })])).toBe('19–23 años')
    expect(formatAgeRange([athlete('a', { age: 19 }), athlete('b', { age: null })])).toBe('19 años')
    expect(formatAgeRange([athlete('a')])).toBe('')
    expect(
      summarizeComposition([
        athlete('a', { division: 'Junior', bodyweightKg: 52, age: 19 }),
        athlete('b', { division: 'Junior', bodyweightKg: 57, age: 23 }),
      ]),
    ).toBe('Femenino · Raw · Junior · 52–57 kg · 19–23 años')
  })

  describe('filtros de la bolsa', () => {
    const pool = [
      athlete('ana', { fullName: 'Ana Torres', division: 'Junior', bodyweightKg: 57, age: 20 }),
      athlete('luis', { fullName: 'Luis Ferro', sex: 'Masculino', bodyweightKg: 83, age: 35 }),
      athlete('sin-datos', { fullName: 'Sin Datos', bodyweightKg: null, age: null }),
    ]
    const ids = (filters) =>
      pool.filter((row) => matchesPoolFilters(row, { ...EMPTY_POOL_FILTERS, ...filters })).map((row) => row.registrationId)

    it('sin filtros deja pasar a todos', () => {
      expect(ids({})).toEqual(['ana', 'luis', 'sin-datos'])
      expect(hasActivePoolFilters(EMPTY_POOL_FILTERS)).toBe(false)
    })

    it('combina sexo, división y búsqueda', () => {
      expect(ids({ sex: 'Femenino' })).toEqual(['ana', 'sin-datos'])
      expect(ids({ sex: 'Femenino', division: 'Junior' })).toEqual(['ana'])
      expect(ids({ query: 'ferro' })).toEqual(['luis'])
    })

    it('filtra por rango de peso y de edad, con extremos incluidos', () => {
      expect(ids({ weightMin: '57', weightMax: '83' })).toEqual(['ana', 'luis'])
      expect(ids({ weightMax: '60' })).toEqual(['ana'])
      expect(ids({ ageMin: '18', ageMax: '20' })).toEqual(['ana'])
    })

    it('sin dato no entra en un rango: no se puede afirmar que le corresponda', () => {
      expect(ids({ weightMin: '0' })).not.toContain('sin-datos')
      expect(ids({ ageMax: '99' })).not.toContain('sin-datos')
      expect(hasActivePoolFilters({ ...EMPTY_POOL_FILTERS, ageMin: '18' })).toBe(true)
    })
  })

  it('avisa cuando una tanda mezcla sexos o supera el tope', () => {
    const mixed = sessionStats(
      [athlete('a'), athlete('b', { sex: 'Masculino' }), athlete('c')],
      2,
    )
    expect(mixed).toMatchObject({ count: 3, capacity: 2, over: true, mixedSex: true })
    expect(sessionStats([athlete('a')], 12)).toMatchObject({ over: false, mixedSex: false })
  })

  it('el payload de tandas conserva el tablado de las existentes y asigna el de las nuevas', () => {
    const days = [
      emptyDay(0, [
        { ...session('ses-a', 'Tanda A'), platformId: 'plat-1' },
        { ...session('ses-b', 'Tanda B'), platformId: null },
        session('ses-c', 'Tanda C'),
      ]),
    ]
    const payload = sessionsPayloadFromBoard(days, {
      extra: [{ dayIndex: 0, name: 'Tanda D', platformId: 'plat-2' }],
    })
    expect(payload[0].platformId).toBe('plat-1')
    expect(payload[1]).toHaveProperty('platformId', null)
    // Sin la clave el RPC enlaza por nombre: no se inventa un null que desenlace.
    expect(payload[2]).not.toHaveProperty('platformId')
    expect(payload[3].platformId).toBe('plat-2')
  })

  it('el tope por defecto es 12', () => {
    expect(DEFAULT_FLIGHT_SIZE).toBe(12)
  })
})
