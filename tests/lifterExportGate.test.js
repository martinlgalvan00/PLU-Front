import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { competitionWeightClass, getWeightClassWarning, suggestWeightClass } from '../shared/pluWeightClasses.js'
import {
  LIFTERS_COLUMNS,
  liftersImportColumnsMissing,
  summarizeLifterMeet,
  validateLifterExport,
} from '../shared/liftersExport.js'
import { competitionProfileFieldsChanged } from '../shared/competitionLexicon.js'
import { normalizeGender, normalizeEquipment, normalizeDivision } from '../shared/competitionLexicon.js'

const TEMPLATE = 'docs/liftingcast-lifters-template.csv'

function lifter(overrides = {}) {
  return {
    name: 'Juan Pérez',
    gender: 'Male',
    rawOrEquipped: 'Raw',
    division: 'Open',
    declaredAwardsWeightClass: '75',
    bodyWeight: '67.5',
    birthDate: '21/10/1992',
    squatOpener: '',
    benchOpener: '',
    deadliftOpener: '',
    _meta: { athleteId: 'ath-1' },
    ...overrides,
  }
}

describe('sugerencia y pesaje', () => {
  it('sugiere la clase del peso y no la aplica', () => {
    expect(suggestWeightClass('Masculino', 67.5)).toBe('67,5')
    expect(suggestWeightClass('Masculino', 83)).toBe('90')
    expect(suggestWeightClass('Masculino', 141)).toBe('140+')
    expect(suggestWeightClass('Femenino', 44)).toBe('44')
  })

  it('el archivo usa el peso del pesaje cuando existe', () => {
    const result = validateLifterExport([
      lifter({
        bodyWeight: '83',
        declaredAwardsWeightClass: '82,5',
        _meta: { athleteId: 'ath-1', bodyweightSource: 'weigh-in' },
      }),
    ])
    expect(result.valid).toBe(true)
    expect(result.warnings).toBe(1)
    expect(result.warningIssues[0].message).toMatch(/pesaje/)
  })

  it('resume clases chicas y diferencias entre declarada y oficial', () => {
    const summary = summarizeLifterMeet([
      lifter({ _meta: { athleteId: 'a', declaredWeightClass: '75', officialWeightClass: '82,5' } }),
      lifter({
        name: 'Ana',
        _meta: { athleteId: 'b', declaredWeightClass: '75', officialWeightClass: '82,5', rosterFrozen: true },
      }),
    ])
    expect(summary.smallClasses).toHaveLength(1)
    expect(summary.smallClasses[0].count).toBe(2)
    expect(summary.mismatches).toHaveLength(2)
    expect(summary.missingWeighIn).toHaveLength(1)
  })

  it('la plantilla oficial no se descarga incompleta', () => {
    expect(liftersImportColumnsMissing({ preset: 'official', columns: ['name'] })).toBe(true)
    expect(liftersImportColumnsMissing({ preset: 'official' })).toBe(false)
    expect(liftersImportColumnsMissing({ preset: 'minimal', columns: ['name'] })).toBe(false)
  })

  it('el cierre del padrón solo mira división, equipamiento y peso', () => {
    const current = { division: 'Open', category: 'Raw', estimated_weight: 80 }
    expect(competitionProfileFieldsChanged(current, { ...current, phone: '1' })).toBe(false)
    expect(competitionProfileFieldsChanged(current, { ...current, estimatedWeight: 81 })).toBe(true)
  })
})

describe('categoría oficial', () => {
  it('el archivo usa la oficial y conserva la declarada como dato distinto', () => {
    expect(
      competitionWeightClass({ declaredWeightClass: '75', officialWeightClass: '82,5' }),
    ).toBe('82,5')
    expect(competitionWeightClass({ declaredWeightClass: '75', officialWeightClass: '' })).toBe('75')
  })
})

describe('advertencia peso vs categoría', () => {
  it('avisa si el peso supera la clase', () => {
    expect(getWeightClassWarning(83, '82,5')?.code).toBe('BODYWEIGHT_OVER_CLASS')
    expect(getWeightClassWarning('83.4', '82.5')?.message).toMatch(/supera la categoría/)
  })

  it('no avisa si el peso entra en la clase', () => {
    expect(getWeightClassWarning(80, '82,5')).toBeNull()
    expect(getWeightClassWarning(82.5, '82,5')).toBeNull()
  })

  it('140+ no tiene tope', () => {
    expect(getWeightClassWarning(200, '140+')).toBeNull()
    expect(getWeightClassWarning(141, '140')).not.toBeNull()
  })
})

describe('validateLifterExport', () => {
  it('acepta un atleta completo', () => {
    const result = validateLifterExport([lifter()])
    expect(result.valid).toBe(true)
    expect(result.ready).toBe(1)
    expect(result.errors).toBe(0)
  })

  it('marca warning sin bloquear si el peso supera la clase', () => {
    const result = validateLifterExport([lifter({ bodyWeight: '83', declaredAwardsWeightClass: '82,5' })])
    expect(result.valid).toBe(true)
    expect(result.warnings).toBe(1)
    expect(result.ready).toBe(0)
  })

  it('rechaza al atleta sin categoría', () => {
    const result = validateLifterExport([lifter({ declaredAwardsWeightClass: '' })])
    expect(result.valid).toBe(false)
    expect(result.issues[0]).toMatchObject({
      athleteId: 'ath-1',
      athleteName: 'Juan Pérez',
      field: 'declaredAwardsWeightClass',
    })
  })

  it('rechaza categoría de otro sexo, fecha, sexo y opener', () => {
    const result = validateLifterExport([
      lifter({
        gender: 'Male',
        declaredAwardsWeightClass: '44',
        birthDate: '1992-10-21',
        squatOpener: 'no',
      }),
    ])
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['birthDate', 'declaredAwardsWeightClass', 'squatOpener']),
    )
  })
})

describe('léxico', () => {
  it('normaliza sexo, equipamiento y división una sola vez', () => {
    expect(normalizeGender('Hombre')).toBe('Male')
    expect(normalizeGender('Mujer')).toBe('Female')
    expect(normalizeGender('otro')).toBe('')
    expect(normalizeEquipment('raw')).toBe('Raw')
    expect(normalizeEquipment('Equipped')).toBe('')
    expect(normalizeDivision('junior')).toBe('Junior')
  })
})

describe('header del importador', () => {
  it('el archivo generado sigue el orden fijo del esquema', () => {
    expect(LIFTERS_COLUMNS.map((column) => column.header)).toEqual([
      'name',
      'team',
      'lot',
      'platform',
      'session',
      'flight',
      'birthDate',
      'memberNumber',
      'gender',
      'rawOrEquipped',
      'division',
      'declaredAwardsWeightClass',
      'bodyWeight',
      'squatOpener',
      'benchOpener',
      'deadliftOpener',
      'squatRackHeight',
      'benchRackHeight',
      'deadliftRackHeight',
      'country',
      'state',
      'instagram',
      'notes',
    ])
  })

  it.skipIf(!existsSync(TEMPLATE))('coincide con el CSV oficial de LiftingCast', () => {
    const header = readFileSync(TEMPLATE, 'utf8').split(/\r?\n/)[0]
    const official = header.split(',').map((cell) => cell.trim().replaceAll(/^"|"$/g, ''))
    expect(LIFTERS_COLUMNS.map((column) => column.header)).toEqual(official)
  })
})
