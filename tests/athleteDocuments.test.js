import { describe, expect, it } from 'vitest'
import {
  athleteAgeYears,
  ATHLETE_DOCUMENT_PDF_MAX_BYTES,
  documentPackFocus,
  documentPackGate,
  documentsBlockCheckout,
  isAthleteMinor,
  isDocumentPackComplete,
  isSafeAthleteDocumentPath,
  needsDocumentGateForRegistration,
  OPTIONAL_ATHLETE_DOCUMENT_KINDS,
  requiredDocumentKinds,
} from '../shared/athleteDocuments.js'
import {
  athleteDocumentUrl,
  validateAthleteDocumentFile,
} from '../src/services/athleteDocumentService.js'

const adult = { birthDate: '1998-04-12', documentsGrandfathered: false }
const minor = { birthDate: '2012-06-01', documentsGrandfathered: false }
const dni = [{ kind: 'dni_front' }, { kind: 'dni_back' }]

describe('legajo de documentos de afiliación', () => {
  it('pide autorización del tutor sólo si es menor de 18', () => {
    expect(isAthleteMinor(adult.birthDate, new Date('2026-11-10'))).toBe(false)
    expect(isAthleteMinor(minor.birthDate, new Date('2026-11-10'))).toBe(true)
    expect(requiredDocumentKinds(adult)).toEqual(['dni_front', 'dni_back'])
    expect(OPTIONAL_ATHLETE_DOCUMENT_KINDS).toEqual(['medical_certificate'])
    expect(requiredDocumentKinds(minor)).toEqual([
      'dni_front',
      'dni_back',
      'minor_authorization',
    ])
    expect(athleteAgeYears('2010-01-01', new Date('2026-11-10'))).toBe(16)
  })

  it('el pack adulto está completo con frente y dorso; el certificado no bloquea', () => {
    expect(isDocumentPackComplete(adult, dni).complete).toBe(true)
    expect(isDocumentPackComplete(adult, dni).missing).toEqual([])
    expect(isDocumentPackComplete(adult, [{ kind: 'dni_front' }]).missing).toEqual(['dni_back'])
    expect(isDocumentPackComplete(adult, [...dni, { kind: 'medical_certificate' }]).complete).toBe(
      true,
    )
    expect(isDocumentPackComplete(minor, dni).missing).toEqual(['minor_authorization'])
    expect(isDocumentPackComplete(adult, []).complete).toBe(false)
  })

  it('sin lista el legajo no se trata como vacío', () => {
    expect(isDocumentPackComplete(adult).unavailable).toBe(true)
    expect(isDocumentPackComplete(adult).complete).toBe(true)
  })

  it('un rechazo anterior no traba el pago cuando el legajo ya está completo', () => {
    const openGate = documentPackGate(adult, undefined, { purpose: 'membership' })
    const completeGate = documentPackGate(adult, dni, { purpose: 'membership' })
    const emptyGate = documentPackGate(adult, [], { purpose: 'membership' })

    expect(documentsBlockCheckout({ gate: openGate, documents: undefined, rejectionPending: true })).toBe(true)
    expect(documentsBlockCheckout({ gate: completeGate, documents: dni, rejectionPending: true })).toBe(false)
    expect(documentsBlockCheckout({ gate: emptyGate, documents: [], rejectionPending: false })).toBe(true)
    expect(documentsBlockCheckout({ gate: completeGate, documents: dni, rejectionPending: false })).toBe(false)
  })

  it('inscripción: el abuelo se frena si el torneo pide afiliación; la renovación siempre', () => {
    const legacy = { ...adult, documentsGrandfathered: true }
    expect(needsDocumentGateForRegistration(legacy)).toBe(false)
    expect(needsDocumentGateForRegistration(legacy, { requiresMembership: true })).toBe(true)
    expect(documentPackGate(legacy, [], { purpose: 'registration' }).blocked).toBe(false)
    expect(
      documentPackGate(legacy, [], { purpose: 'registration', requiresMembership: false }).blocked,
    ).toBe(false)
    expect(
      documentPackGate(legacy, [], { purpose: 'registration', requiresMembership: true }).blocked,
    ).toBe(true)
    expect(
      documentPackGate(legacy, dni, { purpose: 'registration', requiresMembership: true }).blocked,
    ).toBe(false)
    expect(documentPackGate(legacy, [], { purpose: 'membership' }).blocked).toBe(true)
    expect(documentPackGate(legacy, [], { purpose: 'membership' }).missing).toEqual([
      'dni_front',
      'dni_back',
    ])
    expect(documentPackGate(adult, [], { purpose: 'registration' }).blocked).toBe(true)
    expect(documentPackGate(adult, dni, { purpose: 'combo' }).blocked).toBe(false)
    expect(documentPackGate(adult, dni, { purpose: 'membership' }).blocked).toBe(false)
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

  it('acepta un JPG aunque el teléfono no informe el tipo', () => {
    const photo = new File([new Uint8Array(80)], 'dni.jpg', { type: '' })
    expect(validateAthleteDocumentFile(photo)).toMatchObject({ ok: true, contentType: 'image/jpeg' })
  })

  it('rechaza HEIC con un mensaje de captura en JPG', () => {
    const heic = new File([new Uint8Array(80)], 'dni.heic', { type: 'image/heic' })
    expect(validateAthleteDocumentFile(heic).error).toMatch(/JPG/i)
  })

  it('nombra el archivo que falta y no llama certificado a un PDF de DNI', () => {
    expect(documentPackFocus(['dni_front'])).toBe('dni')
    expect(documentPackFocus(['minor_authorization'])).toBe('guardian')
    expect(documentPackFocus(['dni_back', 'minor_authorization'])).toBe('dni_and_guardian')
    const pdf = new File([new Uint8Array(ATHLETE_DOCUMENT_PDF_MAX_BYTES + 1)], 'dni.pdf', {
      type: 'application/pdf',
    })
    const error = validateAthleteDocumentFile(pdf).error
    expect(error).toMatch(/foto del documento/i)
    expect(error).not.toMatch(/certificado/i)
  })

  it('la vista previa no se vuelve a bajar hasta que el archivo se reemplaza', () => {
    expect(athleteDocumentUrl('dni_front')).toBe('/api/athletes/me/documents/dni_front')
    expect(athleteDocumentUrl('dni_front', '2026-11-16T18:00:00.000Z')).toBe(
      '/api/athletes/me/documents/dni_front?v=2026-11-16T18%3A00%3A00.000Z',
    )
  })
})
