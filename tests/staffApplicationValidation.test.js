import { describe, expect, it } from 'vitest'
import {
  getStaffProgress,
  validateStaffApplication,
} from '../src/lib/staffApplicationValidation.js'

const COMPLETE = {
  form: {
    firstName: 'Agustina',
    lastName: 'Pérez',
    documentId: '30111222',
    birthDate: '1998-04-10',
    streetAddress: 'Calle 123',
    city: 'Quilmes',
    province: 'Buenos Aires',
    postalCode: '1878',
    email: 'agustina@example.com',
    phone: '1155551234',
    staffBody: 'operativo',
    technicalTrainingStatus: '',
    shirtSize: 'M',
    backgroundCheckIssuedAt: '2026-05-01',
  },
  photoDone: true,
  certificateDone: true,
  accuracyDeclared: true,
  consentGiven: true,
}

describe('validateStaffApplication', () => {
  it('una postulación completa no tiene errores', () => {
    expect(validateStaffApplication(COMPLETE)).toEqual({})
  })

  it('marca lo que falta con el mismo mensaje que ve la persona', () => {
    const errors = validateStaffApplication({
      ...COMPLETE,
      form: { ...COMPLETE.form, firstName: '', email: 'sin-arroba' },
      photoDone: false,
    })
    expect(errors).toEqual({
      firstName: 'Ingresá tu nombre.',
      email: 'Ingresá un email válido.',
      photo: 'Subí tu foto de perfil.',
    })
  })

  it('el cuerpo Técnico exige indicar la capacitación', () => {
    const errors = validateStaffApplication({
      ...COMPLETE,
      form: { ...COMPLETE.form, staffBody: 'tecnico' },
    })
    expect(errors.technicalTrainingStatus).toMatch(/capacitación/i)
  })
})

describe('getStaffProgress', () => {
  it('todo completo: las cuatro secciones al 100%', () => {
    const progress = getStaffProgress(validateStaffApplication(COMPLETE), COMPLETE.form)
    expect(progress.map((section) => section.complete)).toEqual([true, true, true, true])
  })

  it('cuenta campos hechos por sección', () => {
    const partial = {
      ...COMPLETE,
      form: { ...COMPLETE.form, firstName: '', lastName: '' },
      accuracyDeclared: false,
    }
    const [personal, , , declarations] = getStaffProgress(
      validateStaffApplication(partial),
      partial.form,
    )
    expect(personal).toMatchObject({ done: 8, total: 10, complete: false })
    expect(declarations).toMatchObject({ done: 1, total: 2, complete: false })
  })

  it('la capacitación técnica solo suma al total si el cuerpo es Técnico', () => {
    expect(getStaffProgress({}, { staffBody: 'operativo' })[1].total).toBe(2)
    expect(getStaffProgress({}, { staffBody: 'tecnico' })[1].total).toBe(3)
  })
})
