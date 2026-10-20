import { describe, expect, it } from 'vitest'
import {
  ageOnDate,
  allowedCompetitionDivisions,
  isDivisionAllowedForAge,
  normalizeCompetitionDivision,
  resolveCompetitionDivision,
  resolveDivisionExportFields,
  resolveExportDivision,
  resolveRegistrationDivision,
  toCalendarDate,
  todayCalendarDate,
} from '../shared/ageDivision.js'

describe('toCalendarDate', () => {
  it('acepta ISO y valida día real', () => {
    expect(toCalendarDate('2000-06-15T12:00:00.000Z')).toBe('2000-06-15')
    expect(toCalendarDate('2000-02-29')).toBe('2000-02-29')
    expect(toCalendarDate('2001-02-29')).toBe('')
    expect(toCalendarDate('2024-13-01')).toBe('')
  })

  it('acepta DD/MM/YYYY y DD-MM-YYYY', () => {
    expect(toCalendarDate('15/06/2000')).toBe('2000-06-15')
    expect(toCalendarDate('1-2-1992')).toBe('1992-02-01')
  })
})

describe('normalizeCompetitionDivision', () => {
  it('canoniza aliases legacy y variantes', () => {
    expect(normalizeCompetitionDivision('Sub-Junior')).toBe('Youth')
    expect(normalizeCompetitionDivision('master ii')).toBe('Masters')
    expect(normalizeCompetitionDivision('Sub Masters')).toBe('Sub-Masters')
    expect(normalizeCompetitionDivision('OPEN')).toBe('Open')
    expect(normalizeCompetitionDivision('no-existe')).toBe('')
  })
})

describe('ageOnDate', () => {
  it('calcula edad cumplida sin TZ', () => {
    expect(ageOnDate('2000-06-15', '2024-06-15')).toBe(24)
    expect(ageOnDate('2000-06-15', '2024-06-14')).toBe(23)
  })

  it('acepta ISO largo y DD/MM', () => {
    expect(ageOnDate('2000-01-01T12:00:00.000Z', '2024-01-01T03:00:00.000Z')).toBe(24)
    expect(ageOnDate('15/06/2000', '19/10/2026')).toBe(26)
  })

  it('sin DOB o basura → null', () => {
    expect(ageOnDate(null, '2024-01-01')).toBeNull()
    expect(ageOnDate('no-fecha', '2024-01-01')).toBeNull()
    expect(ageOnDate('2000-01-01', '')).toBeNull()
  })
})

describe('resolveCompetitionDivision', () => {
  const day = '2026-10-19'

  it('bordes Youth / Junior', () => {
    expect(resolveCompetitionDivision('2014-10-19', day)).toBe('Youth') // 12
    expect(resolveCompetitionDivision('2013-10-19', day)).toBe('Junior') // 13
  })

  it('bordes Junior / Open', () => {
    expect(resolveCompetitionDivision('2003-10-19', day)).toBe('Junior') // 23
    expect(resolveCompetitionDivision('2002-10-19', day)).toBe('Open') // 24
  })

  it('bordes Open / Sub-Masters / Masters', () => {
    expect(resolveCompetitionDivision('1992-10-19', day)).toBe('Open') // 34
    expect(resolveCompetitionDivision('1991-10-19', day)).toBe('Sub-Masters') // 35
    expect(resolveCompetitionDivision('1987-10-19', day)).toBe('Sub-Masters') // 39
    expect(resolveCompetitionDivision('1986-10-19', day)).toBe('Masters') // 40
  })

  it('edad al evento vs día de export', () => {
    expect(resolveCompetitionDivision('2003-12-01', '2026-10-19')).toBe('Junior')
    expect(resolveCompetitionDivision('2003-12-01', '2027-12-01')).toBe('Open')
  })

  it('menor de 10 o inválida → vacío', () => {
    expect(resolveCompetitionDivision('2020-01-01', day)).toBe('')
    expect(resolveCompetitionDivision('', day)).toBe('')
    expect(resolveCompetitionDivision('bad', day)).toBe('')
  })
})

describe('resolveExportDivision', () => {
  it('prefiere calculada; sin DOB usa declarada', () => {
    expect(resolveExportDivision('2005-01-01', '2026-10-19', 'Open')).toBe('Junior')
    expect(resolveExportDivision('', '2026-10-19', 'Open')).toBe('Open')
    expect(resolveExportDivision(null, '2026-10-19', '')).toBe('')
  })
})

describe('resolveDivisionExportFields', () => {
  it('Open upgrade (Junior inscrito Open) no es mismatch duro', () => {
    const fields = resolveDivisionExportFields('2005-06-01', '2026-10-19', 'Open')
    expect(fields).toMatchObject({
      division: 'Junior',
      divisionDeclared: 'Open',
      divisionCalculated: 'Junior',
      divisionMismatch: false,
      divisionOpenUpgrade: true,
      divisionDiffers: true,
      age: 21,
    })
  })

  it('mismatch duro cuando la inscrita no aplica a la edad', () => {
    const fields = resolveDivisionExportFields('2005-06-01', '2026-10-19', 'Masters')
    expect(fields.divisionMismatch).toBe(true)
    expect(fields.divisionOpenUpgrade).toBe(false)
    expect(fields.division).toBe('Junior')
  })

  it('canoniza aliases al comparar', () => {
    const fields = resolveDivisionExportFields('2015-01-01', '2026-10-19', 'Sub-Junior')
    expect(fields.divisionCalculated).toBe('Youth')
    expect(fields.divisionDeclared).toBe('Youth')
    expect(fields.divisionMismatch).toBe(false)
  })

  it('sin mismatch si coinciden o falta declarada', () => {
    expect(resolveDivisionExportFields('2005-06-01', '2026-10-19', 'Junior').divisionMismatch).toBe(
      false,
    )
    expect(resolveDivisionExportFields('2005-06-01', '2026-10-19', '').divisionMismatch).toBe(false)
  })
})

describe('todayCalendarDate', () => {
  it('formatea YYYY-MM-DD local', () => {
    expect(todayCalendarDate(new Date(2026, 9, 19))).toBe('2026-10-19')
  })
})

describe('allowedCompetitionDivisions (inscripción)', () => {
  const day = '2026-10-19'

  it('Junior puede Junior u Open', () => {
    expect(allowedCompetitionDivisions('2005-06-01', day)).toEqual(['Junior', 'Open'])
    expect(isDivisionAllowedForAge('Junior', '2005-06-01', day)).toBe(true)
    expect(isDivisionAllowedForAge('Open', '2005-06-01', day)).toBe(true)
    expect(isDivisionAllowedForAge('Masters', '2005-06-01', day)).toBe(false)
  })

  it('acepta alias legacy en isDivisionAllowedForAge', () => {
    expect(isDivisionAllowedForAge('Sub-Junior', '2015-01-01', day)).toBe(true)
  })

  it('Open adulto solo Open', () => {
    expect(allowedCompetitionDivisions('1998-04-12', day)).toEqual(['Open'])
  })

  it('Masters puede Masters u Open', () => {
    expect(allowedCompetitionDivisions('1980-01-01', day)).toEqual(['Masters', 'Open'])
  })

  it('resolveRegistrationDivision clampa la declarada inválida', () => {
    expect(resolveRegistrationDivision('2005-06-01', day, 'Masters')).toBe('Junior')
    expect(resolveRegistrationDivision('2005-06-01', day, 'Open')).toBe('Open')
    expect(resolveRegistrationDivision('2015-01-01', day, 'Sub-Junior')).toBe('Youth')
  })
})
