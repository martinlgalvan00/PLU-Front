import { describe, expect, it } from 'vitest'
import {
  compareAthletes,
  compositionFacets,
  DEFAULT_FLIGHT_SIZE,
  balancedChunks,
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

  it('reparte parejo cuando el grupo excede el tope: 4 con tope 3 son 2 + 2, no 3 + 1', () => {
    const sameClass = [1, 2, 3, 4].map((index) =>
      athlete(`f-${index}`, { sex: 'Femenino', bodyweightKg: 57, fullName: `F${index}` }),
    )
    const plan = planEventBoard({
      maxPerSession: 3,
      unassigned: sameClass,
      days: [emptyDay(0, [])],
    })

    expect(plan.newSessions).toHaveLength(2)
    expect(plan.newSessions.map((row) => row.count)).toEqual([2, 2])
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

describe('armado automático', () => {
  const women = (count, overrides = {}) =>
    Array.from({ length: count }, (_, index) =>
      athlete(`f${index}-${overrides.tag ?? ''}`, {
        sex: 'Femenino',
        fullName: `F${String(index).padStart(2, '0')}`,
        bodyweightKg: 50 + index,
        age: 20 + (index % 7),
        ...overrides,
      }),
    )
  const men = (count, overrides = {}) =>
    Array.from({ length: count }, (_, index) =>
      athlete(`m${index}-${overrides.tag ?? ''}`, {
        sex: 'Masculino',
        fullName: `M${String(index).padStart(2, '0')}`,
        bodyweightKg: 70 + index,
        age: 22 + (index % 9),
        ...overrides,
      }),
    )
  const PLATFORMS = [
    { id: 'p1', name: 'Tablado 1' },
    { id: 'p2', name: 'Tablado 2' },
  ]

  it('balancedChunks nunca deja una tanda de uno si se puede evitar', () => {
    expect(balancedChunks([...Array(13).keys()], 12).map((chunk) => chunk.length)).toEqual([7, 6])
    expect(balancedChunks([...Array(25).keys()], 12).map((chunk) => chunk.length)).toEqual([9, 8, 8])
    expect(balancedChunks([...Array(12).keys()], 12)).toHaveLength(1)
    expect(balancedChunks([], 12)).toEqual([])
  })

  it('nunca mezcla sexos si el sexo es criterio, aunque sobren lugares', () => {
    const plan = planEventBoard({
      maxPerSession: 12,
      unassigned: [...women(3), ...men(3)],
      days: [emptyDay(0)],
    })
    expect(plan.newSessions).toHaveLength(2)
    const bySession = new Map()
    for (const placement of plan.placements) {
      const row = [...women(3), ...men(3)].find((item) => item.registrationId === placement.registrationId)
      bySession.set(placement.tempId, new Set([...(bySession.get(placement.tempId) ?? []), row.sex]))
    }
    for (const sexes of bySession.values()) expect(sexes.size).toBe(1)
  })

  it('sin sexo como criterio permite tandas mixtas', () => {
    const plan = planEventBoard({
      maxPerSession: 12,
      groupBy: ['category'],
      unassigned: [...women(3), ...men(3)],
      days: [emptyDay(0)],
    })
    expect(plan.newSessions).toHaveLength(1)
    expect(plan.newSessions[0].count).toBe(6)
  })

  it('ordena por peso o por edad según el criterio y parte por ahí', () => {
    const group = [
      athlete('viejo-liviano', { age: 50, bodyweightKg: 52 }),
      athlete('joven-pesado', { age: 19, bodyweightKg: 84 }),
      athlete('joven-liviano', { age: 20, bodyweightKg: 53 }),
      athlete('viejo-pesado', { age: 49, bodyweightKg: 83 }),
    ]
    const split = (sortBy) => {
      const plan = planEventBoard({
        maxPerSession: 2,
        sortBy,
        unassigned: group,
        days: [emptyDay(0)],
      })
      return plan.newSessions.map((row) =>
        plan.placements
          .filter((placement) => placement.tempId === row.tempId)
          .map((placement) => placement.registrationId)
          .sort(),
      )
    }
    expect(split('weight')).toEqual([
      ['joven-liviano', 'viejo-liviano'],
      ['joven-pesado', 'viejo-pesado'],
    ])
    expect(split('age')).toEqual([
      ['joven-liviano', 'joven-pesado'],
      ['viejo-liviano', 'viejo-pesado'],
    ])
  })

  it('con dos tablados alterna las tandas de un día entre ellos', () => {
    const plan = planEventBoard({
      maxPerSession: 4,
      unassigned: women(16),
      days: [emptyDay(0)],
      platforms: PLATFORMS,
    })
    expect(plan.newSessions).toHaveLength(4)
    expect(plan.newSessions.map((row) => row.platformId)).toEqual(['p1', 'p2', 'p1', 'p2'])
    expect(plan.newSessions[0].platform).toBe('Tablado 1')
  })

  it('platformMode "sex" fija un sexo por tablado', () => {
    const plan = planEventBoard({
      maxPerSession: 4,
      platformMode: 'sex',
      unassigned: [...women(8), ...men(8)],
      days: [emptyDay(0)],
      platforms: PLATFORMS,
    })
    const platformOf = (prefix) =>
      new Set(
        plan.newSessions
          .filter((row) =>
            plan.placements.find((p) => p.tempId === row.tempId)?.registrationId.startsWith(prefix),
          )
          .map((row) => row.platformId),
      )
    expect([...platformOf('f')]).toEqual(['p1'])
    expect([...platformOf('m')]).toEqual(['p2'])
  })

  it('reparte las tandas nuevas entre días parejas en atletas, en tramos contiguos', () => {
    const plan = planEventBoard({
      maxPerSession: 4,
      unassigned: women(16),
      days: [emptyDay(0), emptyDay(1)],
    })
    expect(plan.newSessions.map((row) => row.dayIndex)).toEqual([0, 0, 1, 1])
  })

  it('respeta los días elegidos', () => {
    const plan = planEventBoard({
      maxPerSession: 4,
      dayIndexes: [1],
      unassigned: women(8),
      days: [emptyDay(0), emptyDay(1)],
    })
    expect(new Set(plan.newSessions.map((row) => row.dayIndex))).toEqual(new Set([1]))
  })

  it('junta restos chicos de divisiones vecinas, pero no de categorías distintas', () => {
    const pool = [
      ...women(3, { division: 'Junior', tag: 'j' }),
      ...women(3, { division: 'Open', tag: 'o' }),
      ...women(3, { category: 'Raw With Wraps', division: 'Open', tag: 'w' }),
    ]
    const merged = planEventBoard({
      maxPerSession: 12,
      groupBy: ['sex', 'category', 'division'],
      unassigned: pool,
      days: [emptyDay(0)],
    })
    // Junior + Open de Raw comparten tanda; Raw With Wraps queda aparte.
    expect(merged.newSessions.map((row) => row.count).sort()).toEqual([3, 6])

    const strict = planEventBoard({
      maxPerSession: 12,
      mergeSmall: false,
      groupBy: ['sex', 'category', 'division'],
      unassigned: pool,
      days: [emptyDay(0)],
    })
    expect(strict.newSessions).toHaveLength(3)
  })

  it('completa primero una tanda existente compatible en vez de abrir otra', () => {
    const already = athlete('placed', { sex: 'Femenino', bodyweightKg: 52 })
    const plan = planEventBoard({
      maxPerSession: 12,
      unassigned: women(4),
      days: [emptyDay(0, [session('ses-vacia', 'Tanda A'), session('ses-a', 'Tanda B', [already])])],
    })
    expect(plan.newSessions).toEqual([])
    expect(new Set(plan.placements.map((row) => row.sessionId))).toEqual(new Set(['ses-a']))
  })

  it('useExisting=false ignora las tandas que ya están', () => {
    const plan = planEventBoard({
      maxPerSession: 12,
      useExisting: false,
      unassigned: women(4),
      days: [emptyDay(0, [session('ses-a', 'Tanda A')])],
    })
    expect(plan.newSessions).toHaveLength(1)
    expect(plan.newSessions[0].name).toBe('Tanda B')
  })

  it('sin días no ubica a nadie y lo dice en leftover', () => {
    const plan = planEventBoard({ maxPerSession: 12, unassigned: women(3), days: [] })
    expect(plan.placed).toBe(0)
    expect(plan.leftover).toHaveLength(3)
  })

  it('nunca pierde ni duplica a nadie: cada atleta aparece una sola vez', () => {
    const pool = [...women(17), ...men(23, { category: 'Raw With Wraps' })]
    const plan = planEventBoard({
      maxPerSession: 8,
      unassigned: pool,
      days: [emptyDay(0), emptyDay(1)],
      platforms: PLATFORMS,
    })
    const ids = plan.placements.map((row) => row.registrationId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length + plan.leftover.length).toBe(pool.length)
    for (const row of plan.newSessions) expect(row.count).toBeLessThanOrEqual(8)
  })

  it('las tandas nuevas llegan al payload con su tablado para persistirse', () => {
    const plan = planEventBoard({
      maxPerSession: 4,
      unassigned: women(8),
      days: [emptyDay(0)],
      platforms: PLATFORMS,
    })
    const payload = sessionsPayloadFromBoard([emptyDay(0)], { extra: plan.newSessions })
    expect(payload.map((row) => row.platformId)).toEqual(['p1', 'p2'])
    expect(payload.map((row) => row.platform)).toEqual(['Tablado 1', 'Tablado 2'])
  })
})
