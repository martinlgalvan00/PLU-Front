import { describe, expect, it } from 'vitest'
import {
  MIN_ATHLETES_FOR_RANGES,
  boardToPublicPayload,
  buildPublicLanes,
  formatPublicComposition,
  formatPublicCompositionParts,
  normalizePublicSchedule,
  pickInitialDayIndex,
  publicScheduleChecks,
  sortSessionsByStart,
} from '../src/lib/publicSchedule.js'

/**
 * Grilla pública: la proyección de `public_event_schedule` no trae nombres ni
 * fechas de nacimiento, y esta capa no tiene de dónde sacarlos.
 */

const PLATFORMS = [
  { id: 'p1', name: 'Tablado 1', sortOrder: 0 },
  { id: 'p2', name: 'Tablado 2', sortOrder: 1 },
]

function session(name, overrides = {}) {
  return {
    name,
    platform: '',
    platformId: null,
    weighInAt: null,
    startsAt: null,
    athleteCount: 0,
    sexes: [],
    categories: [],
    divisions: [],
    weightMin: null,
    weightMax: null,
    ageMin: null,
    ageMax: null,
    ...overrides,
  }
}

describe('normalizePublicSchedule', () => {
  it('apagada o ausente no deja nada que mostrar', () => {
    expect(normalizePublicSchedule({ enabled: false }).hasContent).toBe(false)
    expect(normalizePublicSchedule(null).hasContent).toBe(false)
    expect(normalizePublicSchedule(undefined).days).toEqual([])
    // Cualquier cosa que no sea `enabled: true` se trata como apagada.
    expect(
      normalizePublicSchedule({ enabled: 'true', days: [{ sessions: [{}] }] }).hasContent,
    ).toBe(false)
  })

  it('prendida pero sin tandas tampoco pinta una sección vacía', () => {
    const result = normalizePublicSchedule({
      enabled: true,
      platforms: [],
      days: [{ dayIndex: 0, label: 'Día 1', sessions: [] }],
    })
    expect(result.enabled).toBe(true)
    expect(result.hasContent).toBe(false)
  })

  it('arma carriles por tablado en su orden y mapea los números', () => {
    const result = normalizePublicSchedule({
      enabled: true,
      platforms: PLATFORMS,
      days: [
        {
          dayIndex: 0,
          label: 'Día 1',
          date: '2026-11-13',
          sessions: [
            { name: 'Tanda B', platformId: 'p2', athleteCount: 4, weightMin: '57', weightMax: 63 },
            { name: 'Tanda A', platformId: 'p1', athleteCount: '6' },
          ],
        },
      ],
    })
    const [day] = result.days
    expect(result.hasContent).toBe(true)
    expect(day.lanes.map((lane) => lane.name)).toEqual(['Tablado 1', 'Tablado 2'])
    expect(day.lanes[0].sessions[0].athleteCount).toBe(6)
    expect(day.lanes[1].sessions[0]).toMatchObject({ weightMin: 57, weightMax: 63 })
  })

  it('descarta los días sin tandas', () => {
    const result = normalizePublicSchedule({
      enabled: true,
      platforms: [],
      days: [
        { dayIndex: 0, label: 'Día 1', sessions: [] },
        { dayIndex: 1, label: 'Día 2', sessions: [{ name: 'Tanda A' }] },
      ],
    })
    expect(result.days.map((day) => day.label)).toEqual(['Día 2'])
  })
})

describe('buildPublicLanes', () => {
  it('omite el tablado que ese día no tiene tandas', () => {
    const lanes = buildPublicLanes([session('Tanda A', { platformId: 'p1' })], PLATFORMS)
    expect(lanes.map((lane) => lane.name)).toEqual(['Tablado 1'])
  })

  it('las tandas sin tablado conocido no desaparecen: van al final por su texto legado', () => {
    const lanes = buildPublicLanes(
      [
        session('Tanda A', { platformId: 'p1' }),
        session('Tanda B', { platform: 'Mesa suelta' }),
        session('Tanda C', { platformId: 'borrado' }),
      ],
      PLATFORMS,
    )
    expect(lanes.map((lane) => lane.name)).toEqual(['Tablado 1', 'Mesa suelta', ''])
    expect(lanes[2].sessions[0].name).toBe('Tanda C')
  })

  it('sin tablados y sin texto hay un solo carril sin nombre', () => {
    const lanes = buildPublicLanes([session('Tanda A'), session('Tanda B')], [])
    expect(lanes).toHaveLength(1)
    expect(lanes[0].name).toBe('')
    expect(lanes[0].sessions).toHaveLength(2)
  })
})

describe('sortSessionsByStart', () => {
  const T13 = '2026-11-13T13:00:00.000Z'
  const T15 = '2026-11-13T15:00:00.000Z'

  it('ordena por hora de inicio', () => {
    const sorted = sortSessionsByStart([
      session('Tarde', { startsAt: T15 }),
      session('Mañana', { startsAt: T13 }),
    ])
    expect(sorted.map((row) => row.name)).toEqual(['Mañana', 'Tarde'])
  })

  it('las que no tienen hora van al final, en su orden, sin inventarles un lugar', () => {
    const sorted = sortSessionsByStart([
      session('Sin hora 1'),
      session('Con hora', { startsAt: T15 }),
      session('Sin hora 2'),
    ])
    expect(sorted.map((row) => row.name)).toEqual(['Con hora', 'Sin hora 1', 'Sin hora 2'])
  })

  it('a la misma hora conserva el orden de llegada y no muta la entrada', () => {
    const input = [session('B', { startsAt: T13 }), session('A', { startsAt: T13 })]
    expect(sortSessionsByStart(input).map((row) => row.name)).toEqual(['B', 'A'])
    expect(input.map((row) => row.name)).toEqual(['B', 'A'])
  })

  it('normalizar deja cada tablado en orden de hora y con su total de atletas', () => {
    const result = normalizePublicSchedule({
      enabled: true,
      platforms: PLATFORMS,
      days: [
        {
          dayIndex: 0,
          label: 'Día 1',
          sessions: [
            { name: 'Tarde', platformId: 'p1', startsAt: T15, athleteCount: 4 },
            { name: 'Mañana', platformId: 'p1', startsAt: T13, athleteCount: 6 },
            { name: 'Otra', platformId: 'p2', athleteCount: 3 },
          ],
        },
      ],
    })
    const [first, second] = result.days[0].lanes
    expect(first.sessions.map((row) => row.name)).toEqual(['Mañana', 'Tarde'])
    expect(first.athleteCount).toBe(10)
    expect(second.athleteCount).toBe(3)
  })
})

describe('pickInitialDayIndex', () => {
  const days = [
    { dayIndex: 0, date: '2026-11-13' },
    { dayIndex: 1, date: '2026-11-14' },
  ]

  it('abre el día de hoy si hay competencia hoy, en hora de Buenos Aires', () => {
    // 01:00 UTC del 15 es todavía 14 en Buenos Aires.
    expect(pickInitialDayIndex(days, new Date('2026-11-15T01:00:00.000Z'))).toBe(1)
    expect(pickInitialDayIndex(days, new Date('2026-11-13T15:00:00.000Z'))).toBe(0)
  })

  it('si hoy no se compite, abre el primero; sin días, nada', () => {
    expect(pickInitialDayIndex(days, new Date('2026-10-01T12:00:00.000Z'))).toBe(0)
    expect(pickInitialDayIndex([], new Date())).toBeNull()
  })
})

describe('formatPublicComposition', () => {
  const labels = { sex: { Femenino: 'Female' }, years: 'y/o' }

  it('arma sexo · categoría · división · peso · edad', () => {
    expect(
      formatPublicComposition(
        session('A', {
          athleteCount: 8,
          sexes: ['Femenino'],
          categories: ['Raw'],
          divisions: ['Junior', 'Open'],
          weightMin: 52,
          weightMax: 63,
          ageMin: 19,
          ageMax: 24,
        }),
      ),
    ).toBe('Femenino · Raw · Junior / Open · 52–63 kg · 19–24 años')
  })

  it('la composición sale en dos partes: quiénes son y su rango', () => {
    expect(
      formatPublicCompositionParts(
        session('A', {
          athleteCount: 8,
          sexes: ['Femenino'],
          categories: ['Raw'],
          weightMin: 52,
          weightMax: 63,
          ageMin: 19,
          ageMax: 24,
        }),
      ),
    ).toEqual({ profile: 'Femenino · Raw', range: '52–63 kg · 19–24 años' })
  })

  it('con pocos atletas el rango se reserva: sería el peso y la edad de una persona', () => {
    const alone = session('A', {
      athleteCount: 1,
      sexes: ['Masculino'],
      categories: ['Raw'],
      divisions: ['Open'],
      weightMin: 83,
      weightMax: 83,
      ageMin: 27,
      ageMax: 27,
    })
    expect(formatPublicCompositionParts(alone)).toEqual({
      profile: 'Masculino · Raw · Open',
      range: '',
    })
    expect(formatPublicComposition({ ...alone, athleteCount: 2 })).toBe('Masculino · Raw · Open')
    expect(formatPublicComposition({ ...alone, athleteCount: MIN_ATHLETES_FOR_RANGES })).toBe(
      'Masculino · Raw · Open · 83 kg · 27 años',
    )
  })

  it('traduce el sexo y el sufijo de edad con las etiquetas del idioma activo', () => {
    expect(
      formatPublicComposition(
        session('A', { athleteCount: 5, sexes: ['Femenino'], ageMin: 20, ageMax: 20 }),
        labels,
      ),
    ).toBe('Female · 20 y/o')
  })

  it('un solo peso no se muestra como rango', () => {
    expect(
      formatPublicComposition(session('A', { athleteCount: 5, weightMin: 57, weightMax: 57 })),
    ).toBe('57 kg')
  })

  it('lo que no tiene dato se omite en vez de inventarse', () => {
    expect(formatPublicComposition(session('A'))).toBe('')
    expect(formatPublicComposition(session('A', { athleteCount: 5, ageMin: 30 }))).toBe('30 años')
  })

  it('dos sexos en una tanda se muestran ambos (la organización decidió mezclar)', () => {
    expect(formatPublicComposition(session('A', { sexes: ['Femenino', 'Masculino'] }))).toBe(
      'Femenino / Masculino',
    )
  })
})

describe('boardToPublicPayload', () => {
  const athlete = (overrides = {}) => ({
    registrationId: 'r1',
    fullName: 'Nombre Secreto',
    gym: 'Club Secreto',
    sex: 'Femenino',
    category: 'Raw',
    division: 'Open',
    bodyweightKg: 60,
    age: 25,
    ...overrides,
  })
  const board = {
    platforms: [
      { id: 'p2', name: 'Azul', sortOrder: 1 },
      { id: 'p1', name: 'Rojo', sortOrder: 0 },
    ],
    days: [
      {
        dayIndex: 0,
        label: 'Día 1',
        date: '2026-11-13',
        sessions: [
          { name: 'Tanda B', platformId: 'p2', sortOrder: 1, athletes: [] },
          {
            name: 'Tanda A',
            platform: 'Rojo',
            platformId: 'p1',
            sortOrder: 0,
            weighInAt: '2026-11-13T11:30:00.000Z',
            startsAt: '2026-11-13T13:00:00.000Z',
            athletes: [
              athlete({ bodyweightKg: '63.5', age: 31 }),
              athlete({ sex: 'Masculino', division: 'Junior', bodyweightKg: 52, age: 19 }),
              athlete({ bodyweightKg: null, age: null }),
            ],
          },
        ],
      },
    ],
  }

  it('devuelve la misma forma que la función pública, lista para normalizar', () => {
    const payload = boardToPublicPayload(board)
    expect(payload.enabled).toBe(true)
    expect(payload.platforms.map((row) => row.name)).toEqual(['Rojo', 'Azul'])
    const [first, second] = payload.days[0].sessions
    expect(first.name).toBe('Tanda A')
    expect(first).toMatchObject({
      athleteCount: 3,
      sexes: ['Femenino', 'Masculino'],
      categories: ['Raw'],
      divisions: ['Junior', 'Open'],
      weightMin: 52,
      weightMax: 63.5,
      ageMin: 19,
      ageMax: 31,
    })
    // Sin atletas no hay rangos que inventar.
    expect(second).toMatchObject({ athleteCount: 0, weightMin: null, ageMax: null })
    expect(normalizePublicSchedule(payload).hasContent).toBe(true)
  })

  it('no arrastra nombres, clubes ni ids de inscripción', () => {
    expect(JSON.stringify(boardToPublicPayload(board))).not.toMatch(/Secreto|r1/)
  })

  it('un tablero vacío o ausente no rompe', () => {
    expect(normalizePublicSchedule(boardToPublicPayload(null)).hasContent).toBe(false)
    expect(normalizePublicSchedule(boardToPublicPayload({ days: [] })).hasContent).toBe(false)
  })
})

describe('publicScheduleChecks', () => {
  const people = (count) =>
    Array.from({ length: count }, (_, index) => ({ registrationId: `r${index}` }))
  const board = {
    platforms: [{ id: 'p1', name: 'Rojo' }],
    days: [
      {
        sessions: [
          { platformId: 'p1', startsAt: '2026-11-13T13:00:00.000Z', athletes: people(8) },
          { platformId: 'p1', startsAt: null, athletes: people(6) },
          { platformId: null, startsAt: '2026-11-13T15:00:00.000Z', athletes: people(2) },
          { platformId: 'p1', startsAt: null, athletes: [] },
        ],
      },
    ],
  }

  it('cuenta lo que cambia lo que el sitio va a mostrar', () => {
    expect(publicScheduleChecks(board)).toEqual({ noStart: 1, noPlatform: 1, empty: 1, small: 1 })
  })

  it('una tanda vacía cuenta como vacía, no también como sin hora', () => {
    const checks = publicScheduleChecks({
      ...board,
      days: [{ sessions: [board.days[0].sessions[3]] }],
    })
    expect(checks).toEqual({ noStart: 0, noPlatform: 0, empty: 1, small: 0 })
  })

  it('sin tablados definidos ninguna tanda está "sin tablado"', () => {
    expect(publicScheduleChecks({ ...board, platforms: [] }).noPlatform).toBe(0)
  })

  it('un tablero ausente no rompe', () => {
    expect(publicScheduleChecks(null)).toEqual({ noStart: 0, noPlatform: 0, empty: 0, small: 0 })
  })
})
