import { describe, expect, it } from 'vitest'
import {
  buildPublicLanes,
  formatPublicComposition,
  normalizePublicSchedule,
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
    expect(normalizePublicSchedule({ enabled: 'true', days: [{ sessions: [{}] }] }).hasContent).toBe(
      false,
    )
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

describe('formatPublicComposition', () => {
  const labels = { sex: { Femenino: 'Female' }, years: 'y/o' }

  it('arma sexo · categoría · división · peso · edad', () => {
    expect(
      formatPublicComposition(
        session('A', {
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

  it('traduce el sexo y el sufijo de edad con las etiquetas del idioma activo', () => {
    expect(
      formatPublicComposition(session('A', { sexes: ['Femenino'], ageMin: 20, ageMax: 20 }), labels),
    ).toBe('Female · 20 y/o')
  })

  it('un solo peso no se muestra como rango', () => {
    expect(formatPublicComposition(session('A', { weightMin: 57, weightMax: 57 }))).toBe('57 kg')
  })

  it('lo que no tiene dato se omite en vez de inventarse', () => {
    expect(formatPublicComposition(session('A'))).toBe('')
    expect(formatPublicComposition(session('A', { ageMin: 30 }))).toBe('30 años')
  })

  it('dos sexos en una tanda se muestran ambos (la organización decidió mezclar)', () => {
    expect(formatPublicComposition(session('A', { sexes: ['Femenino', 'Masculino'] }))).toBe(
      'Femenino / Masculino',
    )
  })
})
