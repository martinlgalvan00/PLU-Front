import { describe, expect, it } from 'vitest'
import { buildAdminExportRows } from '../shared/exportRows.js'

const athletes = [
  { id: 'a1', fullName: 'Ana Junior', birthDate: '2005-06-01', division: 'Junior', sex: 'Femenino' },
]

function rowFor(registration) {
  return buildAdminExportRows(
    [{ athleteId: 'a1', eventStartsAt: '2026-11-15', event: 'Pitbull', status: 'confirmada', ...registration }],
    athletes,
    [],
    [],
  )[0]
}

describe('export admin: segunda división y modalidades', () => {
  it('una sola división deja la segunda vacía y Full Power', () => {
    const row = rowFor({ division: 'Junior', category: 'Raw' })
    expect(row.segunda_division).toBe('')
    expect(row.modalidades).toBe('Full Power')
  })

  it('exporta la segunda división y las modalidades legibles', () => {
    const row = rowFor({
      division: 'Junior',
      secondaryDivision: 'Open',
      modalities: ['full_power', 'bench'],
      category: 'Raw',
    })
    expect(row.division).toBe('Junior')
    expect(row.segunda_division).toBe('Open')
    expect(row.modalidades).toBe('Full Power + Banco')
  })

  it('una modalidad parcial sola', () => {
    expect(rowFor({ division: 'Open', modalities: ['push_pull'] }).modalidades).toBe('Push-Pull')
  })

  it('la segunda división no cuenta como desajuste de edad', () => {
    const row = rowFor({ division: 'Junior', secondaryDivision: 'Open' })
    expect(row.division_desajuste).toBe('')
  })
})
