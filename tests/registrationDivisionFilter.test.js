import { describe, expect, it } from 'vitest'
import {
  buildAdminDivisionOptions,
  registrationMatchesDivision,
} from '../src/lib/adminPeopleFilters.js'

const junior = { id: 'a', division: 'Junior', secondaryDivision: 'Open' }
const juniorOnly = { id: 'b', division: 'Junior', secondaryDivision: '' }
const open = { id: 'c', division: 'Open' }
const master = { id: 'd', division: 'Masters', secondaryDivision: 'Open' }

describe('filtro por división con segunda división', () => {
  it('"todas" deja pasar todo', () => {
    expect(registrationMatchesDivision(junior, 'all')).toBe(true)
    expect(registrationMatchesDivision(junior, '')).toBe(true)
    expect(registrationMatchesDivision(junior, undefined)).toBe(true)
  })

  it('un atleta en Junior + Open aparece en las dos listas', () => {
    expect(registrationMatchesDivision(junior, 'junior')).toBe(true)
    expect(registrationMatchesDivision(junior, 'open')).toBe(true)
    expect(registrationMatchesDivision(junior, 'masters')).toBe(false)
  })

  it('quien compite en una sola división aparece solo ahí', () => {
    expect(registrationMatchesDivision(juniorOnly, 'junior')).toBe(true)
    expect(registrationMatchesDivision(juniorOnly, 'open')).toBe(false)
  })

  it('las opciones cuentan a cada atleta en cada división que compite', () => {
    const options = buildAdminDivisionOptions([junior, juniorOnly, open, master], 'Todas')
    expect(options[0]).toEqual(['all', 'Todas', 4])
    const byValue = Object.fromEntries(options.slice(1).map(([value, label, count]) => [value, { label, count }]))
    expect(byValue.open).toEqual({ label: 'Open', count: 3 })
    expect(byValue.junior).toEqual({ label: 'Junior', count: 2 })
    expect(byValue.masters).toEqual({ label: 'Masters', count: 1 })
  })
})
