import { describe, expect, it } from 'vitest'
import { affiliationAccountStep } from '../shared/accountAffiliationStep.js'

const ready = {
  fullName: 'Ana Torres',
  documentId: '30111222',
  birthDate: '1994-04-12',
  sex: 'Femenino',
  phone: '1112345678',
  country: 'Argentina',
  province: 'Buenos Aires',
  city: 'La Plata',
  emailVerifiedAt: '2026-01-02T00:00:00.000Z',
  documents: [{ kind: 'dni_front' }, { kind: 'dni_back' }],
}

describe('próximo paso de la cuenta', () => {
  it('pide el correo antes que la ficha y el DNI', () => {
    expect(
      affiliationAccountStep({
        athlete: { ...ready, emailVerifiedAt: null, city: '', documents: [] },
      }),
    ).toBe('email')
  })

  it('sin correo pendiente pide la ficha antes que el DNI', () => {
    expect(
      affiliationAccountStep({
        athlete: { ...ready, city: '', documents: [] },
      }),
    ).toBe('file')
  })

  it('con la ficha completa pide el DNI', () => {
    expect(
      affiliationAccountStep({
        athlete: { ...ready, documents: [] },
      }),
    ).toBe('documents')
  })

  it('con afiliación vigente no vuelve a pedir la ficha', () => {
    expect(
      affiliationAccountStep({
        athlete: { ...ready, city: '', documents: [] },
        membershipCurrent: true,
      }),
    ).toBe('documents')
  })

  it('no avisa si el correo, la ficha y el DNI ya están', () => {
    expect(affiliationAccountStep({ athlete: ready })).toBeNull()
  })

  it('una lista de documentos que todavía no llegó no se toma como vacía', () => {
    const withoutDocuments = { ...ready }
    delete withoutDocuments.documents
    expect(affiliationAccountStep({ athlete: withoutDocuments })).toBeNull()
  })
})
