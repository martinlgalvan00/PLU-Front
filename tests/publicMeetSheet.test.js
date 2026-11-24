import { describe, expect, it } from 'vitest'
import { toPublicMeetSheet } from '../shared/publicMeetSheet.js'
import { getResultsArchive, listPublishedEventResults } from '../src/services/resultsService.js'

function lifter(overrides) {
  return {
    athleteName: 'Atleta',
    sex: 'M',
    age: 28,
    division: 'Open',
    bodyweightKg: 100,
    totalKg: 500,
    teamName: '',
    equipment: 'Raw',
    place: null,
    bestSquatKg: 200,
    bestBenchKg: 140,
    bestDeadliftKg: 160,
    ...overrides,
  }
}

describe('planilla pública', () => {
  it('arma el podio con puestos 1°, 2° y 3° y deja el DOTS crudo en la categoría', () => {
    const sheet = toPublicMeetSheet({
      title: 'Pitbull Classic',
      rows: [
        lifter({ athleteName: 'Abierta', totalKg: 500, age: 30, bestSquatKg: 210 }),
        lifter({ athleteName: 'Máster', totalKg: 490, age: 60, division: 'Máster', sex: 'masculino' }),
        lifter({ athleteName: 'Tercero', totalKg: 400, sex: 'F', division: 'Open' }),
      ],
    })

    expect(sheet.podium.map((entry) => entry.place.split(' ')[0])).toEqual(['1°', '2°', '3°'])
    expect(sheet.podium[0].athlete).toBe('Máster')
    expect(sheet.podium[0].event).toBe('Pitbull Classic')
    expect(sheet.awards.bestLifter.name).toBe('Máster')
    expect(sheet.awards.bestTeam).toBeNull()

    const openMen = sheet.divisions.find((division) => division.name.includes('Hombres'))
    expect(openMen.lifters[0].dots).toBeCloseTo(307.8, 1)
    expect(openMen.lifters[0].squat).toBe(210)
  })

  it('no inventa un ganador si el máster no tiene edad', () => {
    const sheet = toPublicMeetSheet({
      title: 'Clásico',
      rows: [lifter({ athleteName: 'Sin edad', division: 'Master', age: null, totalKg: 900 })],
    })
    expect(sheet.awards.bestLifter).toBeNull()
    expect(sheet.podium).toEqual([])
    expect(sheet.divisions[0].lifters[0].name).toBe('Sin edad')
  })
})

describe('archivo público', () => {
  it('marca publicada una planilla importada y conserva la muestra estática', () => {
    const archive = getResultsArchive(
      [
        { slug: 'pitbull-classic-2026', title: 'Pitbull', dateISO: '2026-12-12' },
        { slug: 'spring-classic-2025', title: 'Spring', dateISO: '2025-05-18' },
        { slug: 'sin-planilla', title: 'Vacío', dateISO: '2026-01-01' },
      ],
      ['pitbull-classic-2026'],
    )

    expect(archive.map((entry) => [entry.slug, entry.resultsStatus, entry.resultsSource])).toEqual([
      ['pitbull-classic-2026', 'published', 'sheet'],
      ['spring-classic-2025', 'published', 'static'],
      ['sin-planilla', 'pending', null],
    ])
    expect(listPublishedEventResults().map((sheet) => sheet.slug)).toEqual([
      'spring-classic-2025',
      'winter-open-2025',
    ])
  })
})
