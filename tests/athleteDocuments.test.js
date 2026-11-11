import { describe, expect, it } from 'vitest'
import {
  athleteAgeYears,
  documentPackGate,
  isAthleteMinor,
  isDocumentPackComplete,
  isSafeAthleteDocumentPath,
  needsDocumentGateForRegistration,
  requiredDocumentKinds,
} from '../shared/athleteDocuments.js'
import { validateAthleteDocumentFile } from '../src/services/athleteDocumentService.js'

const adult = { birthDate: '1998-04-12', documentsGrandfathered: false }
const minor = { birthDate: '2012-06-01', documentsGrandfathered: false }
const pack = [
  { kind: 'dni_front' },
  { kind: 'dni_back' },
  { kind: 'medical_certificate' },
]

describe('legajo de documentos de afiliación', () => {
  it('pide autorización del tutor sólo si es menor de 18', () => {
    expect(isAthleteMinor(adult.birthDate, new Date('2026-11-10'))).toBe(false)
    expect(isAthleteMinor(minor.birthDate, new Date('2026-11-10'))).toBe(true)
    expect(requiredDocumentKinds(adult)).toEqual([
      'dni_front',
      'dni_back',
      'medical_certificate',
    ])
    expect(requiredDocumentKinds(minor)).toContain('minor_authorization')
    expect(athleteAgeYears('2010-01-01', new Date('2026-11-10'))).toBe(16)
  })

  it('el pack adulto está completo con frente, dorso y certificado', () => {
    expect(isDocumentPackComplete(adult, pack).complete).toBe(true)
    expect(isDocumentPackComplete(adult, pack.slice(0, 2)).missing).toEqual([
      'medical_certificate',
    ])
    expect(isDocumentPackComplete(minor, pack).missing).toEqual(['minor_authorization'])
    expect(isDocumentPackComplete(adult, []).complete).toBe(false)
    expect(isDocumentPackComplete(adult).unavailable).toBe(true)
    expect(isDocumentPackComplete(adult).complete).toBe(true)
  })

  it('inscripción: las cuentas grandfathered no se bloquean; el pago de afiliación sí', () => {
    const legacy = { ...adult, documentsGrandfathered: true }
    expect(needsDocumentGateForRegistration(legacy)).toBe(false)
    expect(documentPackGate(legacy, [], { purpose: 'registration' }).blocked).toBe(false)
    expect(documentPackGate(legacy, [], { purpose: 'membership' }).blocked).toBe(true)
    expect(documentPackGate(adult, [], { purpose: 'registration' }).blocked).toBe(true)
    expect(documentPackGate(adult, pack, { purpose: 'combo' }).blocked).toBe(false)
  })

  it('acepta sólo paths {athleteId}/{kind}/{archivo}', () => {
    const athleteId = '11111111-1111-4111-8111-111111111111'
    expect(
      isSafeAthleteDocumentPath(`${athleteId}/dni_front/123-frente.webp`, {
        athleteId,
        kind: 'dni_front',
      }),
    ).toBe(true)
    expect(isSafeAthleteDocumentPath(`${athleteId}/dni_front/../secret.webp`)).toBe(false)
    expect(isSafeAthleteDocumentPath(`${athleteId}/foto.webp`)).toBe(false)
  })

  it('rechaza HEIC con un mensaje de captura en JPG', () => {
    const heic = new File([new Uint8Array(80)], 'dni.heic', { type: 'image/heic' })
    expect(validateAthleteDocumentFile(heic).error).toMatch(/JPG/i)
  })
})
