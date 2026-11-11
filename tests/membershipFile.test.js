import { describe, expect, it } from 'vitest'
import { membershipFileStatus } from '../shared/membershipFile.js'

const FILE = {
  fullName: 'Ana Torres',
  documentId: '30111222',
  birthDate: '1994-04-12',
  sex: 'Femenino',
  phone: '11 1234 5678',
  country: 'Argentina',
  province: 'Buenos Aires',
  city: 'La Plata',
}

describe('ficha para afiliarse', () => {
  it('acepta la ficha completa y limpia el documento', () => {
    expect(membershipFileStatus({ ...FILE, documentId: '30.111.222' }).complete).toBe(true)
  })

  it('pide lo que falta y rechaza un menor de 14', () => {
    const missing = membershipFileStatus({ fullName: 'Ana', country: 'Argentina' })
    expect(missing.complete).toBe(false)
    expect(missing.missing).toEqual(
      expect.arrayContaining(['documentId', 'birthDate', 'sex', 'phone', 'province', 'city']),
    )

    const young = membershipFileStatus({ ...FILE, birthDate: '2020-01-01' }, { now: new Date('2026-11-10') })
    expect(young.complete).toBe(false)
    expect(young.invalid).toContain('birthDate')
  })
})
