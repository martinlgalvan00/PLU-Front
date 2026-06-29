import { describe, expect, it } from 'vitest'
import { calculateAmount, findDuplicateAthlete } from '../src/services/athleteService.js'

describe('athleteService', () => {
  it('calcula montos por tipo de trámite', () => {
    expect(calculateAmount('both')).toBe(78000)
    expect(calculateAmount('membership')).toBe(38000)
    expect(calculateAmount('event')).toBe(45000)
  })

  it('detecta duplicados por email o documento', () => {
    const athletes = [{ email: 'a@b.com', documentId: '123', fullName: 'Test' }]
    expect(findDuplicateAthlete(athletes, { email: 'a@b.com', documentId: '999' })).toBeTruthy()
    expect(findDuplicateAthlete(athletes, { email: 'x@y.com', documentId: '123' })).toBeTruthy()
    expect(findDuplicateAthlete(athletes, { email: 'x@y.com', documentId: '999' })).toBeFalsy()
  })
})
