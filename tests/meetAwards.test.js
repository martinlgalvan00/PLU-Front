import { describe, expect, it } from 'vitest'
import { computeMeetAwards, dotsScore, mccullochCoefficient } from '../shared/meetAwards.js'

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
    ...overrides,
  }
}

describe('DOTS y McCulloch', () => {
  it('calcula DOTS de un hombre de 100 kg con 500 kg de total', () => {
    // 500 × 500 / polinomio masculino en 100 kg.
    expect(dotsScore('M', 100, 500)).toBeCloseTo(307.758, 2)
  })

  it('usa los coeficientes de McCulloch publicados para 42, 60 y 75 años', () => {
    expect(mccullochCoefficient(42)).toBeCloseTo(1.02, 3)
    expect(mccullochCoefficient(60)).toBeCloseTo(1.34, 3)
    expect(mccullochCoefficient(75)).toBeCloseTo(1.835, 3)
    expect(mccullochCoefficient(30)).toBe(1)
    expect(mccullochCoefficient(null)).toBeNull()
  })
})

describe('premios del meet', () => {
  it('elige al mejor levantador por DOTS y aplica McCulloch si es máster con edad', () => {
    const open = lifter({ athleteName: 'Abierta', totalKg: 500, age: 30 })
    const master = lifter({
      athleteName: 'Máster',
      totalKg: 490,
      age: 60,
      division: 'Máster',
    })
    const awards = computeMeetAwards([open, master])
    expect(awards.bestLifter.athleteName).toBe('Máster')
    expect(awards.bestLifter.score).toBeCloseTo(dotsScore('M', 100, 490) * 1.34, 1)
    expect(awards.mastersMissingAge).toBe(0)
  })

  it('deja afuera al máster sin edad y lo cuenta', () => {
    const awards = computeMeetAwards([
      lifter({ athleteName: 'Abierta', totalKg: 400 }),
      lifter({ athleteName: 'Sin edad', division: 'Master', age: null, totalKg: 900 }),
    ])
    expect(awards.bestLifter.athleteName).toBe('Abierta')
    expect(awards.mastersMissingAge).toBe(1)
  })

  it('no inventa el mejor equipo si no hay tres equipos de 4 a 15', () => {
    const awards = computeMeetAwards([
      lifter({ athleteName: 'A', teamName: 'Norte' }),
      lifter({ athleteName: 'B', teamName: 'Norte' }),
    ])
    expect(awards.bestTeam).toBeNull()
    expect(awards.bestTeamReason).toBe('not_enough_teams')
  })

  it('promedia el DOTS de los cinco mejores cuando hay al menos tres equipos', () => {
    const rows = []
    for (const team of ['Norte', 'Sur', 'Oeste']) {
      for (let index = 0; index < 4; index += 1) {
        rows.push(
          lifter({
            athleteName: `${team} ${index}`,
            teamName: team,
            totalKg: team === 'Norte' ? 600 : 450,
            bodyweightKg: 90,
          }),
        )
      }
    }
    const awards = computeMeetAwards(rows)
    expect(awards.bestTeam.teamName).toBe('Norte')
    expect(awards.bestTeam.lifterCount).toBe(4)
    expect(awards.qualifyingTeamCount).toBe(3)
    expect(awards.bestTeamReason).toBeNull()
  })

  it('explica que falta el equipo cuando nadie tiene gimnasio', () => {
    const awards = computeMeetAwards([lifter({ athleteName: 'Sola' })])
    expect(awards.bestTeamReason).toBe('no_team_data')
  })
})
