import { describe, expect, it } from 'vitest'
import { calculateAmount, findDuplicateAthlete } from '../src/services/athleteService.js'

describe('athleteService', () => {
  it('calcula montos por tipo de trámite', () => {
    // El combo promocional se retiró: el trámite conjunto vale la suma de
    // lista (afiliación + inscripción), sin precio de oferta en el bundle.
    expect(calculateAmount('both')).toBe(150000)
    expect(calculateAmount('membership')).toBe(75000)
    expect(calculateAmount('event')).toBe(75000)
  })

  it('detecta duplicados por email o documento', () => {
    const athletes = [{ email: 'a@b.com', documentId: '123', fullName: 'Test' }]
    expect(findDuplicateAthlete(athletes, { email: 'a@b.com', documentId: '999' })).toBeTruthy()
    expect(findDuplicateAthlete(athletes, { email: 'x@y.com', documentId: '123' })).toBeTruthy()
    expect(findDuplicateAthlete(athletes, { email: 'x@y.com', documentId: '999' })).toBeFalsy()
  })
})
