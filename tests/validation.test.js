import { describe, expect, it } from 'vitest'
import { validateAthleteForm } from '../src/lib/validation.js'
import { DEFAULT_FORM } from '../src/lib/constants.js'

describe('validation', () => {
  it('rechaza formulario vacío', () => {
    const result = validateAthleteForm(DEFAULT_FORM)
    expect(result.success).toBe(false)
  })

  it('acepta formulario completo', () => {
    const result = validateAthleteForm({
      ...DEFAULT_FORM,
      fullName: 'Juan Pérez',
      documentId: '40111222',
      birthDate: '1990-01-01',
      email: 'juan@example.com',
      phone: '+54 11 1234-5678',
      province: 'Buenos Aires',
      city: 'CABA',
      gym: 'Maximal',
      estimatedWeight: '82.5',
    })
    expect(result.success).toBe(true)
  })
})
