import { describe, expect, it } from 'vitest'
import { absorbPage, fromStoredMeetRow, toStoredMeetRow } from '../server/services/eventMeetResults.js'

describe('planilla guardada en el evento del sitio', () => {
  it('conserva los kilos y el equipo al ir y volver de la base', () => {
    const stored = toStoredMeetRow({
      athleteName: 'Ana López',
      sex: 'F',
      age: 28.9,
      division: 'Open',
      category: '-63',
      bodyweightKg: 62.4,
      equipment: 'Raw',
      teamName: 'Norte',
      place: 1,
      squat1Kg: 150,
      squat2Kg: null,
      squat3Kg: null,
      bench1Kg: 80,
      bench2Kg: null,
      bench3Kg: null,
      deadlift1Kg: 170,
      deadlift2Kg: null,
      deadlift3Kg: null,
      bestSquatKg: 150,
      bestBenchKg: 80,
      bestDeadliftKg: 170,
      totalKg: 400,
    })

    expect(stored.age).toBe(28)
    expect(stored.team_name).toBe('Norte')
    expect(stored.formula).toBe('dots')
    expect(stored.source).toBe('liftingcast')

    const row = fromStoredMeetRow(stored)
    expect(row.athleteName).toBe('Ana López')
    expect(row.totalKg).toBe(400)
    expect(row.bestSquatKg).toBe(150)
    expect(row.teamName).toBe('Norte')
    expect(row.place).toBe(1)
  })
})

describe('lectura por páginas', () => {
  it('sigue leyendo cuando la página viene llena y corta cuando viene corta', () => {
    const first = absorbPage([], Array.from({ length: 1000 }, (_, index) => index), {
      pageSize: 1000,
      max: 5000,
    })
    expect(first.done).toBe(false)
    expect(first.truncated).toBe(false)

    const last = absorbPage(first.rows, [1000], { pageSize: 1000, max: 5000 })
    expect(last.done).toBe(true)
    expect(last.rows).toHaveLength(1001)
  })

  it('no recorta una planilla que supera el máximo', () => {
    const step = absorbPage(Array.from({ length: 5000 }, (_, index) => index), [5000], {
      pageSize: 1000,
      max: 5000,
    })
    expect(step.truncated).toBe(true)
    expect(step.rows).toHaveLength(5000)
  })
})
