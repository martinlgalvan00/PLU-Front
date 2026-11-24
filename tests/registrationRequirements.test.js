import { describe, expect, it } from 'vitest'
import {
  BODYWEIGHT_KG_RANGE,
  checkRequiredRegistrationFields,
  isValidBodyweightKg,
  REGISTRATION_REQUIRED_MESSAGES,
} from '../shared/registrationRequirements.js'

const COMPLETE = {
  division: 'Open',
  category: 'Raw',
  modalities: ['full_power'],
  declaredWeightClass: '83',
  bodyweightKg: 82.5,
  firstMeet: false,
  competitionBestTotalKg: 500,
}

describe('campos obligatorios de la inscripción', () => {
  it('una inscripción completa pasa', () => {
    expect(checkRequiredRegistrationFields(COMPLETE)).toEqual({ ok: true })
  })

  it('frena si no hay ninguna modalidad elegida', () => {
    for (const empty of [undefined, null, [], [''], 'full_power']) {
      expect(checkRequiredRegistrationFields({ ...COMPLETE, modalities: empty })).toEqual({
        ok: false,
        field: 'modalities',
        message: REGISTRATION_REQUIRED_MESSAGES.modalities,
      })
    }
  })

  it.each(['division', 'category', 'declaredWeightClass', 'bodyweightKg'])(
    'frena si falta %s y avisa con su mensaje',
    (field) => {
      for (const empty of [undefined, null, '', '   ']) {
        expect(checkRequiredRegistrationFields({ ...COMPLETE, [field]: empty })).toEqual({
          ok: false,
          field,
          message: REGISTRATION_REQUIRED_MESSAGES[field],
        })
      }
    },
  )

  it('informa primero el campo que viene antes en el formulario', () => {
    expect(checkRequiredRegistrationFields({}).field).toBe('division')
    expect(checkRequiredRegistrationFields({ division: 'Open' }).field).toBe('category')
    expect(checkRequiredRegistrationFields({ division: 'Open', category: 'Raw' }).field).toBe(
      'modalities',
    )
    expect(
      checkRequiredRegistrationFields({ division: 'Open', category: 'Raw', modalities: ['squat'] })
        .field,
    ).toBe('declaredWeightClass')
  })

  it('el peso corporal tiene que ser un número dentro del rango', () => {
    const { min, max } = BODYWEIGHT_KG_RANGE
    expect([min, max, 82.5, '90', '82,5'.replace(',', '.')].every(isValidBodyweightKg)).toBe(true)
    for (const bad of [min - 0.1, max + 0.1, 0, -5, 'abc', NaN, Infinity, null, undefined, '']) {
      expect(isValidBodyweightKg(bad), String(bad)).toBe(false)
    }
    expect(checkRequiredRegistrationFields({ ...COMPLETE, bodyweightKg: 400 }).field).toBe(
      'bodyweightKg',
    )
  })

  it('exige el máximo de competencia, o el de entrenamiento si es el primer torneo', () => {
    expect(checkRequiredRegistrationFields({ ...COMPLETE, competitionBestTotalKg: '' })).toEqual({
      ok: false,
      field: 'competitionBestTotalKg',
      message: 'Ingresá tu máximo total en competencia (entre 10 y 2.000 kg).',
    })
    expect(
      checkRequiredRegistrationFields({
        ...COMPLETE,
        firstMeet: true,
        competitionBestTotalKg: '',
        trainingBestTotalKg: '480,5',
      }),
    ).toEqual({ ok: true })
    expect(
      checkRequiredRegistrationFields({
        ...COMPLETE,
        firstMeet: true,
        trainingBestTotalKg: '9',
      }).field,
    ).toBe('trainingBestTotalKg')
  })

  it('el mensaje del peso nombra el rango real', () => {
    expect(REGISTRATION_REQUIRED_MESSAGES.bodyweightKg).toContain('10')
    expect(REGISTRATION_REQUIRED_MESSAGES.bodyweightKg).toContain('250')
  })
})
