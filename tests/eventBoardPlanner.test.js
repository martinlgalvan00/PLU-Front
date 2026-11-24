import { describe, expect, it } from 'vitest'
import {
  compareAthletes,
  compositionFacets,
  DEFAULT_FLIGHT_SIZE,
  balancedChunks,
  estimateLaneTimes,
  minutesOfDay,
  sessionDuration,
  suggestPlanOptions,
  EMPTY_POOL_FILTERS,
  isoFromLocalMinutes,
  normalizeSchedule,
  optimalChunks,
  parseClock,
  rebuildInput,
  weightClassIndex,
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
  suggestFill,
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

describe('motor v2', () => {
  const byWeight = (weights, overrides = {}) =>
    weights.map((weight, index) =>
      athlete(`w${index}-${weight}`, {
        sex: 'Femenino',
        fullName: `A${String(index).padStart(3, '0')}`,
        bodyweightKg: weight,
        age: 20 + (index % 9),
        ...overrides,
      }),
    )
  const splitsInsideClass = (chunks, bounds) =>
    chunks.slice(1).filter((chunk, index) => {
      const before = chunks[index].at(-1).bodyweightKg
      const after = chunk[0].bodyweightKg
      return weightClassIndex(before, bounds) === weightClassIndex(after, bounds)
    }).length

  it('weightClassIndex ubica el peso en su clase y no inventa si no hay clases', () => {
    const bounds = [52, 57, 63]
    expect(weightClassIndex(52, bounds)).toBe(0)
    expect(weightClassIndex(52.5, bounds)).toBe(1)
    expect(weightClassIndex(70, bounds)).toBe(3)
    expect(weightClassIndex(60, [])).toBeNull()
    expect(weightClassIndex(null, bounds)).toBeNull()
  })

  it('optimalChunks no parte una clase de peso si puede evitarlo', () => {
    // 14 atletas, tope 8 → 2 tandas. La partida pareja (7/7) cae en medio de
    // la clase −57; correr el corte un lugar deja cada clase entera.
    const bounds = [52, 57, 63]
    const list = byWeight([50, 51, 52, 52, 55, 56, 57, 57, 58, 60, 61, 62, 63, 63])
    const naive = balancedChunks(list, 8)
    const smart = optimalChunks(list, 8, {
      sameKey: (a, b) => weightClassIndex(a.bodyweightKg, bounds) === weightClassIndex(b.bodyweightKg, bounds),
      gapAt: (a, b) => b.bodyweightKg - a.bodyweightKg,
    })
    expect(smart.flat()).toEqual(list)
    expect(smart.every((chunk) => chunk.length <= 8)).toBe(true)
    expect(splitsInsideClass(naive, bounds)).toBe(1)
    expect(splitsInsideClass(smart, bounds)).toBe(0)
  })

  it('optimalChunks mantiene el orden, el tope y cubre a todos', () => {
    const list = byWeight(Array.from({ length: 53 }, (_, index) => 50 + (index % 40)).sort((a, b) => a - b))
    const chunks = optimalChunks(list, 12, {})
    expect(chunks.flat()).toEqual(list)
    expect(chunks).toHaveLength(Math.ceil(53 / 12))
    expect(chunks.every((chunk) => chunk.length >= 1 && chunk.length <= 12)).toBe(true)
    // Parejas: nunca se separan por más de uno cuando no hay nada que respetar.
    const sizes = chunks.map((chunk) => chunk.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('sin clases, entre cortes igual de parejos elige el que cae en un hueco de peso', () => {
    // 15 atletas, tope 8 → 2 tandas: 8/7 y 7/8 son igual de parejos. El hueco
    // (60 → 80) decide de qué lado cae el corte.
    const gapAt = (a, b) => b.bodyweightKg - a.bodyweightKg
    const sameKey = () => false
    const gapAfterEight = byWeight([50, 51, 52, 53, 54, 55, 56, 57, 80, 81, 82, 83, 84, 85, 86])
    const gapAfterSeven = byWeight([50, 51, 52, 53, 54, 55, 56, 80, 81, 82, 83, 84, 85, 86, 87])
    expect(optimalChunks(gapAfterEight, 8, { sameKey, gapAt }).map((chunk) => chunk.length)).toEqual([8, 7])
    expect(optimalChunks(gapAfterSeven, 8, { sameKey, gapAt }).map((chunk) => chunk.length)).toEqual([7, 8])
  })

  it('las clases de peso cargadas por la organización gobiernan los cortes del plan', () => {
    const women = byWeight([50, 51, 52, 52, 55, 56, 57, 57, 58, 60, 61, 62, 63, 63])
    const plan = planEventBoard({
      maxPerSession: 8,
      weightClasses: { Femenino: [52, 57, 63] },
      unassigned: women,
      days: [emptyDay(0)],
    })
    const rows = plan.newSessions.map((row) =>
      plan.placements
        .filter((placement) => placement.tempId === row.tempId)
        .map((placement) => women.find((item) => item.registrationId === placement.registrationId).bodyweightKg),
    )
    expect(rows).toHaveLength(2)
    expect(Math.max(...rows[0])).toBeLessThanOrEqual(57)
    expect(Math.min(...rows[1])).toBeGreaterThan(57)
  })

  it('balance de carga: el tablado con menos atletas recibe la tanda siguiente', () => {
    const plan = planEventBoard({
      maxPerSession: 12,
      groupBy: ['sex'],
      mergeSmall: false,
      // Tandas de 12, 12, 3, 3, 3, 3: alternar deja 18/18 pero por orden 12+3+3 vs 12+3+3;
      // lo que se afirma es que ningún tablado supera al otro por más de una tanda chica.
      unassigned: [
        ...byWeight(Array.from({ length: 24 }, (_, index) => 50 + index), { tag: 'f' }),
        ...Array.from({ length: 12 }, (_, index) =>
          athlete(`m${index}`, { sex: 'Masculino', bodyweightKg: 70 + index, fullName: `M${index}` }),
        ),
      ],
      days: [emptyDay(0)],
      platforms: [
        { id: 'p1', name: 'Tablado 1' },
        { id: 'p2', name: 'Tablado 2' },
      ],
    })
    const [one, two] = plan.stats.byPlatform
    expect(one.athletes + two.athletes).toBe(36)
    expect(Math.abs(one.athletes - two.athletes)).toBeLessThanOrEqual(12)
    expect(plan.stats.sessions).toBe(plan.summaries.length)
  })

  it('el tablado que ya tiene gente ese día recibe menos tandas nuevas', () => {
    const busy = {
      ...session('ses-a', 'Tanda A', byWeight(Array.from({ length: 12 }, (_, index) => 50 + index), { tag: 'busy' })),
      platformId: 'p1',
    }
    const plan = planEventBoard({
      maxPerSession: 12,
      useExisting: false,
      groupBy: [],
      unassigned: byWeight(Array.from({ length: 24 }, (_, index) => 70 + index), { tag: 'new' }),
      days: [emptyDay(0, [busy])],
      platforms: [
        { id: 'p1', name: 'Tablado 1' },
        { id: 'p2', name: 'Tablado 2' },
      ],
    })
    // Dos tandas nuevas de 12: las dos van al tablado 2, que estaba vacío.
    expect(plan.newSessions.map((row) => row.platformId)).toEqual(['p2', 'p1'])
    expect(plan.stats.byPlatform.map((row) => row.athletes)).toEqual([12, 12])
  })

  it('platformMode "alternate" sigue alternando sin mirar la carga', () => {
    const plan = planEventBoard({
      maxPerSession: 4,
      platformMode: 'alternate',
      unassigned: byWeight(Array.from({ length: 16 }, (_, index) => 50 + index)),
      days: [emptyDay(0)],
      platforms: [{ id: 'p1', name: 'T1' }, { id: 'p2', name: 'T2' }],
    })
    expect(plan.newSessions.map((row) => row.platformId)).toEqual(['p1', 'p2', 'p1', 'p2'])
  })

  describe('horarios', () => {
    it('parseClock acepta HH:MM válidos y rechaza el resto', () => {
      expect(parseClock('09:30')).toBe(570)
      expect(parseClock('9:05')).toBe(545)
      expect(parseClock('24:00')).toBeNull()
      expect(parseClock('9.30')).toBeNull()
      expect(parseClock('')).toBeNull()
    })

    it('isoFromLocalMinutes usa la hora de Buenos Aires y rueda de día', () => {
      expect(isoFromLocalMinutes('2026-11-13', 9 * 60)).toBe('2026-11-13T12:00:00.000Z')
      expect(isoFromLocalMinutes('2026-11-13', 22 * 60)).toBe('2026-11-14T01:00:00.000Z')
      expect(isoFromLocalMinutes(null, 60)).toBe('')
    })

    it('normalizeSchedule devuelve null si no se puede calcular', () => {
      expect(normalizeSchedule(null)).toBeNull()
      expect(normalizeSchedule({ firstStart: 'x', sessionMinutes: 60 })).toBeNull()
      expect(normalizeSchedule({ firstStart: '09:00', sessionMinutes: 0 })).toBeNull()
      expect(normalizeSchedule({ firstStart: '09:00', sessionMinutes: 60 })).toMatchObject({ gap: 0, lead: 0 })
    })

    it('cada tablado corre sus tandas una tras otra y los dos en paralelo', () => {
      const plan = planEventBoard({
        maxPerSession: 4,
        unassigned: byWeight(Array.from({ length: 16 }, (_, index) => 50 + index)),
        days: [{ ...emptyDay(0), date: '2026-11-13' }],
        platforms: [{ id: 'p1', name: 'T1' }, { id: 'p2', name: 'T2' }],
        schedule: { firstStart: '09:00', sessionMinutes: 60, gapMinutes: 10, weighInLeadMinutes: 120 },
      })
      const of = (platformId) => plan.newSessions.filter((row) => row.platformId === platformId)
      expect(of('p1').map((row) => row.startsAt)).toEqual([
        '2026-11-13T12:00:00.000Z',
        '2026-11-13T13:10:00.000Z',
      ])
      // En paralelo: el tablado 2 arranca a la misma hora que el 1.
      expect(of('p2')[0].startsAt).toBe('2026-11-13T12:00:00.000Z')
      expect(of('p1')[0].weighInAt).toBe('2026-11-13T10:00:00.000Z')
    })

    it('sin fecha en el día o sin horarios no inventa horarios', () => {
      const withoutDate = planEventBoard({
        maxPerSession: 4,
        unassigned: byWeight([50, 51]),
        days: [emptyDay(0)],
        schedule: { firstStart: '09:00', sessionMinutes: 60 },
      })
      expect(withoutDate.newSessions[0].startsAt).toBe('')
      const withoutSchedule = planEventBoard({
        maxPerSession: 4,
        unassigned: byWeight([50, 51]),
        days: [{ ...emptyDay(0), date: '2026-11-13' }],
      })
      expect(withoutSchedule.newSessions[0].startsAt).toBe('')
    })

    it('las tandas nuevas llevan sus horarios al payload que se persiste', () => {
      const plan = planEventBoard({
        maxPerSession: 4,
        unassigned: byWeight([50, 51]),
        days: [{ ...emptyDay(0), date: '2026-11-13' }],
        schedule: { firstStart: '09:00', sessionMinutes: 60, weighInLeadMinutes: 90 },
      })
      const [row] = sessionsPayloadFromBoard([emptyDay(0)], { extra: plan.newSessions })
      expect(row.startsAt).toBe('2026-11-13T12:00:00.000Z')
      expect(row.weighInAt).toBe('2026-11-13T10:30:00.000Z')
    })
  })

  describe('duración estimada por atletas', () => {
    const dated = { ...emptyDay(0), date: '2026-11-13' }

    it('la tanda dura según cuántos atletas tiene y la siguiente arranca al terminar', () => {
      const plan = planEventBoard({
        maxPerSession: 6,
        unassigned: byWeight(Array.from({ length: 9 }, (_, index) => 50 + index)),
        days: [dated],
        platforms: [{ id: 'p1', name: 'T1' }],
        schedule: { firstStart: '09:00', minutesPerAthlete: 5, gapMinutes: 10, weighInLeadMinutes: 0 },
      })
      // 9 con tope 6 -> 5 + 4. La 1.ª dura 25 min, la 2.ª arranca a las 09:35 (hora local -03).
      expect(plan.newSessions.map((row) => row.count)).toEqual([5, 4])
      expect(plan.newSessions.map((row) => row.startsAt)).toEqual([
        '2026-11-13T12:00:00.000Z',
        '2026-11-13T12:35:00.000Z',
      ])
    })

    it('sessionDuration: estimada por atleta o fija, nunca menos de un minuto', () => {
      const estimated = normalizeSchedule({ firstStart: '09:00', minutesPerAthlete: 3.5 })
      expect(sessionDuration(estimated, 12)).toBe(42)
      expect(sessionDuration(estimated, 0)).toBe(1)
      expect(sessionDuration(normalizeSchedule({ firstStart: '09:00', sessionMinutes: 45 }), 12)).toBe(45)
    })

    it('una tanda con hora puesta a mano corre el cursor del tablado', () => {
      const existing = {
        ...session('s1', 'Tanda A', [athlete('x', { sex: 'Masculino' })]),
        platformId: 'p1',
        startsAt: '2026-11-13T15:00:00.000Z', // 12:00 locales
      }
      const plan = planEventBoard({
        maxPerSession: 4,
        useExisting: false,
        unassigned: byWeight([50, 51]),
        days: [{ ...dated, sessions: [existing] }],
        platforms: [{ id: 'p1', name: 'T1' }],
        schedule: { firstStart: '09:00', minutesPerAthlete: 10, gapMinutes: 10 },
      })
      // La existente dura 10 min desde las 12:00: la nueva arranca 12:20.
      expect(plan.newSessions[0].startsAt).toBe('2026-11-13T15:20:00.000Z')
    })

    it('estimateLaneTimes recalcula las horas de un tablado en orden', () => {
      const rows = estimateLaneTimes({
        date: '2026-11-13',
        schedule: { firstStart: '10:00', minutesPerAthlete: 5, gapMinutes: 0, weighInLeadMinutes: 60 },
        sessions: [
          session('a', 'A', byWeight([50, 51, 52, 53])),
          session('b', 'B', byWeight([60, 61])),
        ],
      })
      expect(rows.map((row) => row.startsAt)).toEqual([
        '2026-11-13T13:00:00.000Z',
        '2026-11-13T13:20:00.000Z',
      ])
      expect(rows[0].weighInAt).toBe('2026-11-13T12:00:00.000Z')
      expect(estimateLaneTimes({ sessions: [session('a', 'A')], schedule: null })).toEqual([])
    })

    it('minutesOfDay solo vale dentro de la fecha dada', () => {
      expect(minutesOfDay('2026-11-13T12:30:00.000Z', '2026-11-13')).toBe(9 * 60 + 30)
      expect(minutesOfDay('2026-11-14T12:30:00.000Z', '2026-11-13')).toBeNull()
      expect(minutesOfDay('', '2026-11-13')).toBeNull()
    })
  })

  describe('reparto entre días con carga previa', () => {
    it('un día ya cargado recibe menos tandas nuevas que uno vacío', () => {
      const loaded = emptyDay(0, [
        session('s1', 'Tanda A', byWeight(Array.from({ length: 12 }, (_, index) => 40 + index))),
      ])
      const plan = planEventBoard({
        maxPerSession: 6,
        useExisting: false,
        unassigned: byWeight(Array.from({ length: 12 }, (_, index) => 60 + index)),
        days: [loaded, emptyDay(1)],
      })
      const perDay = (dayIndex) =>
        plan.newSessions.filter((row) => row.dayIndex === dayIndex).reduce((sum, row) => sum + row.count, 0)
      expect(perDay(0) + perDay(1)).toBe(12)
      expect(perDay(1)).toBeGreaterThan(perDay(0))
    })

    it('sin carga previa el corte entre días sigue siendo parejo', () => {
      const plan = planEventBoard({
        maxPerSession: 6,
        unassigned: byWeight(Array.from({ length: 24 }, (_, index) => 50 + index)),
        days: [emptyDay(0), emptyDay(1)],
      })
      const perDay = (dayIndex) =>
        plan.newSessions.filter((row) => row.dayIndex === dayIndex).reduce((sum, row) => sum + row.count, 0)
      expect(perDay(0)).toBe(12)
      expect(perDay(1)).toBe(12)
    })
  })

  describe('suggestPlanOptions', () => {
    it('toma el tope vigente y corta por sexo cuando hay una sola categoría', () => {
      const options = suggestPlanOptions({ athletes: byWeight([50, 51]), days: [emptyDay(0)], flightSize: 10 })
      expect(options.maxPerSession).toBe(10)
      expect(options.groupBy).toEqual(['sex'])
      expect(options.schedule).toBeNull()
    })

    it('con categorías distintas corta también por categoría', () => {
      const options = suggestPlanOptions({
        athletes: [athlete('a', { category: 'Raw' }), athlete('b', { category: 'Equipado' })],
        days: [emptyDay(0)],
      })
      expect(options.groupBy).toEqual(['sex', 'category'])
      expect(options.maxPerSession).toBe(DEFAULT_FLIGHT_SIZE)
    })

    it('con fecha propone horarios y arranca donde ya arranca la tanda más temprana', () => {
      const early = { ...session('s1', 'A'), startsAt: '2026-11-13T11:30:00.000Z' } // 08:30 locales
      const options = suggestPlanOptions({
        athletes: [],
        days: [{ ...emptyDay(0, [early]), date: '2026-11-13' }],
      })
      expect(options.schedule).toMatchObject({ firstStart: '08:30', minutesPerAthlete: 4 })
      const fresh = suggestPlanOptions({ athletes: [], days: [{ ...emptyDay(0), date: '2026-11-13' }] })
      expect(fresh.schedule.firstStart).toBe('09:00')
    })
  })

  describe('rehacer desde cero', () => {
    const board = () => ({
      unassigned: [athlete('free', { fullName: 'Libre' })],
      days: [
        {
          ...emptyDay(0, [
            session('ses-a', 'Tanda A', [
              athlete('in-a', { fullName: 'Ya entró', checkedIn: true }),
              athlete('mv-a', { fullName: 'Movible A' }),
            ]),
          ]),
          withoutSession: [athlete('mid', { fullName: 'Con día' })],
        },
      ],
    })

    it('toma a todos menos a quien ya registró ingreso', () => {
      const { candidates, days } = rebuildInput(board())
      expect(candidates.map((row) => row.registrationId).sort()).toEqual(['free', 'mid', 'mv-a'])
      // La tanda queda con el atleta que ya pasó por la puerta, fijo.
      expect(days[0].sessions[0].athletes.map((row) => row.registrationId)).toEqual(['in-a'])
    })

    it('reutiliza las tandas existentes vaciadas antes de abrir nuevas', () => {
      const { candidates, days } = rebuildInput(board())
      const plan = planEventBoard({ maxPerSession: 12, unassigned: candidates, days })
      expect(plan.newSessions).toEqual([])
      expect(new Set(plan.placements.map((row) => row.sessionId))).toEqual(new Set(['ses-a']))
      expect(plan.placed).toBe(3)
    })
  })

  describe('con 234 inscriptos', () => {
    function crowd(total, seed = 7) {
      let state = seed
      const rand = () => {
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296
      }
      const divisions = ['Open', 'Junior', 'Youth', 'Sub-Masters', 'Masters']
      return Array.from({ length: total }, (_, index) =>
        athlete(`c${index}`, {
          fullName: `Atleta ${String(index).padStart(3, '0')}`,
          sex: rand() < 0.55 ? 'Femenino' : 'Masculino',
          category: rand() < 0.7 ? 'Raw' : 'Raw With Wraps',
          division: divisions[Math.floor(rand() * divisions.length)],
          bodyweightKg: Math.round((47 + rand() * 75) * 2) / 2,
          age: 15 + Math.floor(rand() * 40),
        }),
      )
    }
    const PLATFORMS = [{ id: 'p1', name: 'Tablado 1' }, { id: 'p2', name: 'Tablado 2' }]

    it('ubica a todos exactamente una vez, respeta el tope y reparte parejo entre tablados y días', () => {
      const people = crowd(234)
      const plan = planEventBoard({
        maxPerSession: 12,
        unassigned: people,
        days: [{ ...emptyDay(0), date: '2026-11-13' }, { ...emptyDay(1), date: '2026-11-14' }],
        platforms: PLATFORMS,
      })
      const ids = plan.placements.map((row) => row.registrationId)
      expect(new Set(ids).size).toBe(234)
      expect(plan.leftover).toEqual([])
      expect(plan.newSessions.every((row) => row.count <= 12)).toBe(true)

      const loadOf = (dayIndex, platformId) =>
        plan.summaries
          .filter((row) => row.dayIndex === dayIndex && row.platformId === platformId)
          .reduce((sum, row) => sum + row.added, 0)
      const perDay = [0, 1].map((day) => loadOf(day, 'p1') + loadOf(day, 'p2'))
      expect(Math.abs(perDay[0] - perDay[1])).toBeLessThanOrEqual(24)
      for (const day of [0, 1]) {
        expect(Math.abs(loadOf(day, 'p1') - loadOf(day, 'p2'))).toBeLessThanOrEqual(12)
      }
    })

    it('con sexo como criterio ninguna tanda mezcla sexos, para varias semillas', () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const people = crowd(234, seed)
        const plan = planEventBoard({
          maxPerSession: 12,
          groupBy: ['sex', 'category'],
          unassigned: people,
          days: [emptyDay(0)],
          platforms: PLATFORMS,
        })
        expect(plan.stats.mixedSex).toBe(0)
        expect(plan.placed + plan.leftover.length).toBe(234)
      }
    })

    it('es rápido: planificar 234 con clases de peso tarda bien menos de un segundo', () => {
      const people = crowd(234)
      const started = performance.now()
      for (let run = 0; run < 5; run += 1) {
        planEventBoard({
          maxPerSession: 12,
          unassigned: people,
          days: [{ ...emptyDay(0), date: '2026-11-13' }],
          platforms: PLATFORMS,
          weightClasses: { Femenino: [47, 52, 57, 63, 69, 76, 84], Masculino: [59, 66, 74, 83, 93, 105, 120] },
          schedule: { firstStart: '09:00', sessionMinutes: 45, gapMinutes: 10, weighInLeadMinutes: 120 },
        })
      }
      expect((performance.now() - started) / 5).toBeLessThan(500)
    })

    it('partir por clases corta menos clases por la mitad que el reparto parejo a ciegas', () => {
      const bounds = { Femenino: [47, 52, 57, 63, 69, 76, 84], Masculino: [59, 66, 74, 83, 93, 105, 120] }
      const people = crowd(234, 11).filter((row) => row.sex === 'Femenino' && row.category === 'Raw')
      const sorted = [...people].sort((a, b) => a.bodyweightKg - b.bodyweightKg)
      const cut = (chunks) =>
        chunks.slice(1).filter((chunk, index) =>
          weightClassIndex(chunks[index].at(-1).bodyweightKg, bounds.Femenino) ===
          weightClassIndex(chunk[0].bodyweightKg, bounds.Femenino),
        ).length
      const smart = optimalChunks(sorted, 12, {
        sameKey: (a, b) =>
          weightClassIndex(a.bodyweightKg, bounds.Femenino) === weightClassIndex(b.bodyweightKg, bounds.Femenino),
        gapAt: (a, b) => b.bodyweightKg - a.bodyweightKg,
      })
      expect(cut(smart)).toBeLessThanOrEqual(cut(balancedChunks(sorted, 12)))
    })
  })
})

describe('suggestFill', () => {
  const person = (id, overrides = {}) =>
    athlete(id, { fullName: id, sex: 'Femenino', category: 'Raw', bodyweightKg: 60, ...overrides })

  it('en una tanda con gente trae los más cercanos a su rango de peso, del mismo sexo y categoría', () => {
    const tanda = session('s', 'Tanda A', [
      person('a', { bodyweightKg: 60 }),
      person('b', { bodyweightKg: 64 }),
    ])
    const pool = [
      person('lejos', { bodyweightKg: 90 }),
      person('justo-debajo', { bodyweightKg: 58 }),
      person('dentro', { bodyweightKg: 62 }),
      person('hombre', { sex: 'Masculino', bodyweightKg: 62 }),
      person('otra-categoria', { category: 'Raw With Wraps', bodyweightKg: 62 }),
      person('justo-arriba', { bodyweightKg: 66 }),
    ]
    expect(suggestFill({ session: tanda, pool, capacity: 6 })).toEqual([
      'dentro',
      'justo-debajo',
      'justo-arriba',
      'lejos',
    ])
  })

  it('no pasa del cupo que queda', () => {
    const tanda = session('s', 'Tanda A', Array.from({ length: 10 }, (_, index) => person(`in${index}`)))
    const pool = Array.from({ length: 5 }, (_, index) => person(`p${index}`, { bodyweightKg: 61 + index }))
    expect(suggestFill({ session: tanda, pool, capacity: 12 })).toHaveLength(2)
    expect(suggestFill({ session: tanda, pool, capacity: 10 })).toEqual([])
  })

  it('una tanda vacía toma el primer grupo de la bolsa en orden de competencia, liviano a pesado', () => {
    const pool = [
      person('m1', { sex: 'Masculino', bodyweightKg: 70 }),
      person('f-pesada', { bodyweightKg: 80 }),
      person('f-liviana', { bodyweightKg: 50 }),
      person('f-wraps', { category: 'Raw With Wraps', bodyweightKg: 40 }),
    ]
    // Femenino primero; dentro de él la categoría que ordena primero ("Raw" < "Raw With Wraps").
    expect(suggestFill({ session: session('s', 'T', []), pool, capacity: 12 })).toEqual([
      'f-liviana',
      'f-pesada',
    ])
  })

  it('una tanda que ya mezcla sexos no sugiere nada', () => {
    const tanda = session('s', 'Tanda A', [person('a'), person('b', { sex: 'Masculino' })])
    expect(suggestFill({ session: tanda, pool: [person('c')], capacity: 12 })).toEqual([])
  })

  it('con la bolsa vacía no sugiere nada', () => {
    expect(suggestFill({ session: session('s', 'T', []), pool: [], capacity: 12 })).toEqual([])
  })

  it('una tanda cuyos atletas no tienen peso igual completa con el mismo sexo', () => {
    const tanda = session('s', 'Tanda A', [person('a', { bodyweightKg: null })])
    const ids = suggestFill({
      session: tanda,
      pool: [person('x', { bodyweightKg: 70 }), person('y', { sex: 'Masculino' })],
      capacity: 12,
    })
    expect(ids).toEqual(['x'])
  })
})
