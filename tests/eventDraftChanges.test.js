import { describe, expect, it } from 'vitest'
import { areaOfDraftField, describeDraftChanges } from '../src/lib/eventDraftChanges.js'

const base = {
  title: 'Barbell Submission',
  slots: 180,
  pricing: { registration: 75000 },
  ticketTypes: [],
  paymentChannelOverrides: null,
  bankTransfer: { alias: '', cbu: '', holder: '' },
  published: false,
  expectedUpdatedAt: '2027-01-01T00:00:00Z',
}
const sig = JSON.stringify(base)

describe('describeDraftChanges', () => {
  it('sin diferencias no hay áreas', () => {
    expect(describeDraftChanges({ ...base }, sig)).toEqual([])
  })

  it('ubica cada cambio en su área y respeta el orden del panel', () => {
    const draft = {
      ...base,
      published: true,
      paymentChannelOverrides: { registration: { bank_transfer: 'open' } },
      pricing: { registration: 80000 },
      title: 'Otro título',
    }
    expect(describeDraftChanges(draft, sig)).toEqual(['basics', 'prices', 'payment', 'visibility'])
  })

  it('un campo que se actualiza solo no cuenta como edición', () => {
    expect(describeDraftChanges({ ...base, expectedUpdatedAt: 'otra' }, sig)).toEqual([])
  })

  it('un campo desconocido cae en Datos para no esconder un cambio', () => {
    expect(describeDraftChanges({ ...base, algoNuevo: 1 }, sig)).toEqual(['basics'])
    expect(areaOfDraftField('algoNuevo')).toBe('basics')
  })

  it('con una firma ilegible no inventa nada', () => {
    expect(describeDraftChanges(base, null)).toEqual([])
    expect(describeDraftChanges(base, '{no es json')).toEqual([])
  })
})
