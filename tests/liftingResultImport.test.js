import { describe, expect, it } from 'vitest'
import { attachAthleteMatch, parseLiftingCastCsv } from '../server/services/liftingResultImport.js'

const CSV = `Name,Sex,Age,Division,Bodyweight,Equipment,Team,Total
Ana López,F,29,Open,63,Raw,Norte,410
,F,30,Open,70,Raw,Sur,400
Bruno Díaz,M,61,Master,93,Raw,,500
`

describe('importación LiftingCast', () => {
  it('lee filas válidas y deja afuera las que no tienen nombre o total', () => {
    const parsed = parseLiftingCastCsv(CSV)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].athleteName).toBe('Ana López')
    expect(parsed.rows[0].teamName).toBe('Norte')
    expect(parsed.rows[0].totalKg).toBe(410)
    expect(parsed.errors).toEqual([{ row: 3, message: 'Fila sin nombre.' }])
  })

  it('arma el total con los mejores intentos válidos', () => {
    const parsed = parseLiftingCastCsv(
      'Lifter;Sex;Squat1;Squat2;Bench1;Deadlift1\nCiro;M;100;-110;80;120\n',
    )
    expect(parsed.rows[0].totalKg).toBe(300)
    expect(parsed.rows[0].bestSquatKg).toBe(100)
  })

  it('completa el gimnasio solo cuando hay una sola ficha con ese nombre', () => {
    const parsed = parseLiftingCastCsv('Name,Sex,Total\nBruno Díaz,M,500\nAna López,F,400\n')
    const matched = attachAthleteMatch(parsed.rows, [
      { personId: 'p1', firstName: 'Bruno', lastName: 'Díaz', gym: 'Oeste' },
      { personId: 'p2', firstName: 'Ana', lastName: 'López', gym: 'Norte' },
      { personId: 'p3', firstName: 'Ana', lastName: 'López', gym: 'Sur' },
    ])
    expect(matched[0].personId).toBe('p1')
    expect(matched[0].teamName).toBe('Oeste')
    expect(matched[1].personId).toBeNull()
    expect(matched[1].teamName).toBeNull()
  })
})
