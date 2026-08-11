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
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'CABA',
      gym: 'Maximal',
      sex: 'Masculino',
      password: 'clave-muy-segura-2026',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza fecha inválida', () => {
    const result = validateAthleteForm({
      ...DEFAULT_FORM,
      fullName: 'Juan Pérez',
      documentId: '40111222',
      birthDate: '1990-13-40',
      email: 'juan@example.com',
      phone: '+54 11 1234-5678',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'CABA',
      gym: 'Maximal',
      sex: 'Masculino',
    })
    expect(result.success).toBe(false)
    expect(result.errors.birthDate).toBeTruthy()
  })

  it('rechaza fecha de nacimiento futura', () => {
    const result = validateAthleteForm({
      ...DEFAULT_FORM,
      fullName: 'Juan Pérez',
      documentId: '40111222',
      birthDate: '2999-01-01',
      email: 'juan@example.com',
      phone: '+54 11 1234-5678',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'CABA',
      gym: 'Maximal',
      sex: 'Masculino',
      password: 'clave-muy-segura-2026',
    })

    expect(result.success).toBe(false)
    expect(result.errors.birthDate).toBeTruthy()
  })

  it('rechaza DNI numérico demasiado corto', () => {
    const result = validateAthleteForm({
      ...DEFAULT_FORM,
      fullName: 'Juan Pérez',
      documentId: '123456',
      birthDate: '1990-01-01',
      email: 'juan@example.com',
      phone: '+54 11 1234-5678',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'CABA',
      gym: 'Maximal',
      sex: 'Masculino',
    })
    expect(result.success).toBe(false)
    expect(result.errors.documentId).toBeTruthy()
  })

  it('rechaza contraseña corta con mensaje i18n', () => {
    const t = (key) =>
      ({
        'validation.password': 'Usá al menos 12 caracteres.',
        'validation.invalid': 'Datos inválidos',
      })[key] ?? key

    const result = validateAthleteForm(
      {
        ...DEFAULT_FORM,
        fullName: 'Juan Pérez',
        documentId: '40111222',
        birthDate: '1990-01-01',
        email: 'juan@example.com',
        phone: '+54 11 1234-5678',
        country: 'Argentina',
        province: 'Buenos Aires',
        city: 'CABA',
        gym: 'Maximal',
        sex: 'Masculino',
        password: 'Mancedo2026',
      },
      t,
    )

    expect(result.success).toBe(false)
    expect(result.errors.password).toBe('Usá al menos 12 caracteres.')
  })
})
