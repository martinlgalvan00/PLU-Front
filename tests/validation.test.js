import { describe, expect, it } from 'vitest'
import { validateAthleteForm, validateCompetitionForm } from '../src/lib/validation.js'
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

  it('rechaza división fuera de franja de edad', () => {
    const t = (key) =>
      ({
        'validation.divisionAge': 'División no válida por edad.',
        'validation.invalid': 'Datos inválidos',
        'validation.weightClass': 'Seleccioná la categoría de peso en la que vas a competir.',
      })[key] ?? key

    const form = {
      division: 'Masters',
      category: 'Raw',
      declaredWeightClass: '90',
      estimatedWeight: '83',
      paymentMethod: 'mercado_pago',
      competitionBestTotalKg: '500',
    }
    const age = {
      birthDate: '2005-06-01',
      eventDate: '2026-10-19',
      sex: 'Masculino',
    }
    const rejected = validateCompetitionForm(form, t, age)
    expect(rejected.success).toBe(false)
    expect(rejected.errors.division).toBe('División no válida por edad.')

    const accepted = validateCompetitionForm({ ...form, division: 'Open' }, t, age)
    expect(accepted.success).toBe(true)

    const missingClass = validateCompetitionForm(
      { ...form, division: 'Open', declaredWeightClass: '' },
      t,
      age,
    )
    expect(missingClass.success).toBe(false)
    expect(missingClass.errors.declaredWeightClass).toBe(
      'Seleccioná la categoría de peso en la que vas a competir.',
    )

    const womenClassOnMan = validateCompetitionForm(
      { ...form, division: 'Open', declaredWeightClass: '44' },
      t,
      age,
    )
    expect(womenClassOnMan.success).toBe(false)
  })

  describe('segunda división y modalidades', () => {
    const t = (key) =>
      ({
        'validation.divisionAge': 'División no válida por edad.',
        'validation.divisionSecond': 'Esa segunda división no está disponible para tu edad.',
        'validation.modality': 'Elegí una modalidad válida.',
        'validation.modalityRequired': 'Elegí al menos una modalidad.',
        'validation.modalityCombination':
          'Push-Pull ya incluye banco y peso muerto: no se combina con ellos.',
        'validation.invalid': 'Datos inválidos',
        'validation.weightClass': 'Seleccioná la categoría de peso en la que vas a competir.',
      })[key] ?? key
    const age = { birthDate: '2005-06-01', eventDate: '2026-11-15', sex: 'Masculino' }
    const base = {
      division: 'Junior',
      category: 'Raw',
      declaredWeightClass: '90',
      estimatedWeight: '83',
      paymentMethod: 'mercado_pago',
      competitionBestTotalKg: '500',
    }

    it('Junior puede sumar Open', () => {
      const result = validateCompetitionForm({ ...base, secondaryDivision: 'Open' }, t, age)
      expect(result.success).toBe(true)
    })

    it('rechaza una segunda división que no corresponde a la edad', () => {
      const result = validateCompetitionForm({ ...base, secondaryDivision: 'Masters' }, t, age)
      expect(result.success).toBe(false)
      expect(result.errors.secondaryDivision).toBe('Esa segunda división no está disponible para tu edad.')
    })

    it('rechaza una segunda división igual a la primera', () => {
      const result = validateCompetitionForm({ ...base, secondaryDivision: 'Junior' }, t, age)
      expect(result.success).toBe(false)
      expect(result.errors.secondaryDivision).toBeTruthy()
    })

    it('Full Power con otra modalidad es válido', () => {
      const result = validateCompetitionForm({ ...base, modalities: ['full_power', 'bench'] }, t, age)
      expect(result.success).toBe(true)
    })

    it('cualquier combinación de especialidades es válida', () => {
      const result = validateCompetitionForm({ ...base, modalities: ['squat', 'bench'] }, t, age)
      expect(result.success).toBe(true)
    })

    it('exige al menos una modalidad', () => {
      const result = validateCompetitionForm({ ...base, modalities: [] }, t, age)
      expect(result.success).toBe(false)
      expect(result.errors.modalities).toBe('Elegí al menos una modalidad.')
    })

    it('Push-Pull con banco es redundante', () => {
      const result = validateCompetitionForm({ ...base, modalities: ['push_pull', 'bench'] }, t, age)
      expect(result.success).toBe(false)
      expect(result.errors.modalities).toBe(
        'Push-Pull ya incluye banco y peso muerto: no se combina con ellos.',
      )
    })

    it('rechaza una modalidad inexistente', () => {
      const result = validateCompetitionForm({ ...base, modalities: ['rumba'] }, t, age)
      expect(result.success).toBe(false)
      expect(result.errors.modalities).toBe('Elegí una modalidad válida.')
    })

    it('un formulario sin modalidades (versión vieja) sigue siendo válido', () => {
      expect(validateCompetitionForm(base, t, age).success).toBe(true)
    })
  })
})
