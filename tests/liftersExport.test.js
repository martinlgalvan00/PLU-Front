import { describe, expect, it } from 'vitest'
import {
  LIFTERS_COLUMNS,
  LIFTERS_EXPORT_PRESETS,
  buildLiftersExportRows,
  buildLiftersFieldGaps,
  buildLiftersReadiness,
  buildLiftersSummarySheet,
  filterLiftersRowsByCompleteness,
  getMissingLiftersFields,
  liftersRowsForSpreadsheet,
  mapCountryToLiftersCode,
  mapSexToLiftersGender,
  normalizeLiftersExportOptions,
  previewLiftersExport,
  resolveLiftersColumnKeys,
  serializeLiftersSpreadsheet,
} from '../shared/liftersExport.js'
import { serializeSpreadsheet } from '../shared/exportRows.js'

const athlete = {
  id: 'a1',
  fullName: 'Gonzalo Taborrelli',
  birthDate: '1992-02-19',
  sex: 'Masculino',
  gym: 'Pitbull',
  country: 'Argentina',
  province: 'Bs As',
  city: 'Quilmes',
  streetAddress: 'Calle 845',
  postalCode: '1881',
  email: 'gonza@example.com',
  phone: '1554564645',
  category: 'Raw',
  division: 'Open',
  emergencyContactName: 'Madre',
  emergencyContactPhone: '1199988877',
}

describe('liftersExport', () => {
  it('mapea gender y country al formato LiftingCast', () => {
    expect(mapSexToLiftersGender('Masculino')).toBe('Male')
    expect(mapSexToLiftersGender('Femenino')).toBe('Female')
    expect(mapCountryToLiftersCode('Argentina')).toBe('AR')
  })

  it('detecta faltantes', () => {
    expect(getMissingLiftersFields({ ...athlete, birthDate: '' })).toContain('birthDate')
    expect(getMissingLiftersFields(athlete)).toEqual([])
  })

  it('arma filas con encabezados LiftingCast (sin columnas de grilla/racks)', () => {
    const rows = buildLiftersExportRows(
      [{ id: 'r1', athleteId: 'a1', category: 'Raw', division: 'Open' }],
      [athlete],
      [{ athleteId: 'a1', memberCode: 'PLU-1' }],
    )
    const sheet = liftersRowsForSpreadsheet(rows)[0]
    expect(Object.keys(sheet)).toEqual(LIFTERS_COLUMNS.map((col) => col.header))
    expect(sheet.Name).toBe('Gonzalo Taborrelli')
    expect(sheet.Team).toBe('Pitbull')
    expect(sheet['Birth Date']).toBe('1992-02-19')
    expect(sheet['Member Number']).toBe('PLU-1')
    expect(sheet.Gender).toBe('Male')
    expect(sheet.RawOrEquipped).toBe('Raw')
    expect(sheet.Country).toBe('AR')
    expect(sheet.StreetAddress).toBe('Calle 845')
    expect(sheet['Zip Code']).toBe('1881')
    expect(sheet).not.toHaveProperty('lot')
    expect(sheet).not.toHaveProperty('bodyWeight')
    expect(sheet).not.toHaveProperty('squat1')
  })

  it('calcula division por DOB; Open inscrito es upgrade (no mismatch duro)', () => {
    const junior = {
      ...athlete,
      id: 'a-junior',
      fullName: 'Junior Test',
      birthDate: '2005-06-01',
      division: '',
    }
    const rows = buildLiftersExportRows(
      [
        {
          id: 'r1',
          athleteId: 'a-junior',
          category: 'Raw',
          division: 'Open',
          eventStartsAt: '2026-10-19',
        },
      ],
      [junior],
      [],
    )
    expect(rows[0].division).toBe('Junior')
    expect(rows[0].divisionEntered).toBe('Open')
    expect(rows[0].divisionMismatch).toBe('Open')
    expect(rows[0]._meta.divisionMismatch).toBe(false)
    expect(rows[0]._meta.divisionOpenUpgrade).toBe(true)
    const sheet = liftersRowsForSpreadsheet(rows)[0]
    expect(sheet.Division).toBe('Junior')
    expect(sheet.DivisionEntered).toBe('Open')
    expect(sheet.DivisionMismatch).toBe('Open')
    const readiness = buildLiftersReadiness(rows)
    expect(readiness.divisionMismatch).toBe(0)
    expect(readiness.divisionOpenUpgrade).toBe(1)
    const xml = serializeLiftersSpreadsheet(rows, 'Lifters')
    expect(xml).not.toContain('ss:StyleID="Mismatch"')
  })

  it('mismatch duro (inscrita inválida) va en azul en el Excel', () => {
    const rows = buildLiftersExportRows(
      [
        {
          id: 'r1',
          athleteId: 'a1',
          category: 'Raw',
          division: 'Masters',
          eventStartsAt: '2026-10-19',
        },
      ],
      [athlete],
      [],
    )
    expect(rows[0].division).toBe('Open')
    expect(rows[0]._meta.divisionMismatch).toBe(true)
    expect(rows[0].divisionMismatch).toBe('Yes')
    const xml = serializeLiftersSpreadsheet(rows, 'Lifters')
    expect(xml).toContain('ss:ID="Mismatch"')
    expect(xml).toContain('ss:StyleID="Mismatch"')
  })

  it('sin DOB mantiene la división declarada', () => {
    const rows = buildLiftersExportRows(
      [{ id: 'r1', athleteId: 'a2', category: 'Raw', division: 'Masters' }],
      [{ id: 'a2', fullName: 'Sin DOB', sex: 'Femenino' }],
      [],
    )
    expect(rows[0].division).toBe('Masters')
    expect(liftersRowsForSpreadsheet(rows)[0].Division).toBe('Masters')
  })

  it('readiness cuenta incompletos y ranking de campos vacíos', () => {
    const almostA = {
      ...athlete,
      id: 'a2',
      fullName: 'Incompleto A',
      streetAddress: '',
      postalCode: '',
    }
    const almostB = {
      ...athlete,
      id: 'a3',
      fullName: 'Incompleto B',
      streetAddress: '',
      postalCode: '',
      emergencyContactName: '',
    }
    const rows = buildLiftersExportRows(
      [
        { id: 'r1', athleteId: 'a1', category: 'Raw', division: 'Open' },
        { id: 'r2', athleteId: 'a2', category: 'Raw', division: 'Open' },
        { id: 'r3', athleteId: 'a3', category: 'Raw', division: 'Open' },
      ],
      [athlete, almostA, almostB],
      [],
    )
    const readiness = buildLiftersReadiness(rows)
    expect(readiness.total).toBe(3)
    expect(readiness.incomplete).toBe(2)
    expect(readiness.athletes.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Incompleto A', 'Incompleto B']),
    )
    expect(readiness.fieldGaps[0].field).toBe('postalCode')
    expect(readiness.fieldGaps[0].count).toBe(2)
    expect(readiness.fieldGaps.find((gap) => gap.field === 'streetAddress')?.count).toBe(2)
    expect(readiness.topGaps[0].percent).toBeGreaterThan(0)
    expect(buildLiftersFieldGaps(rows).find((gap) => gap.field === 'emergencyContactName')?.count).toBe(
      1,
    )
  })

  it('spreadsheet estila filas incompletas', () => {
    const xml = serializeSpreadsheet(
      [{ name: 'A', birthDate: '' }],
      'Lifters',
      { incompleteRowIndexes: [0] },
    )
    expect(xml).toContain('ss:ID="Header"')
    expect(xml).toContain('ss:ID="Incomplete"')
    expect(xml).toContain('FreezePanes')
  })

  it('serializeLiftersSpreadsheet usa headers LiftingCast, EmptyCell y anchos', () => {
    const rows = buildLiftersExportRows(
      [{ id: 'r1', athleteId: 'a2', category: 'Raw', division: 'Open' }],
      [{ ...athlete, id: 'a2', fullName: 'Sin dirección', streetAddress: '', postalCode: '' }],
      [],
    )
    const xml = serializeLiftersSpreadsheet(rows, 'Lifters')
    expect(xml).toContain('Birth Date')
    expect(xml).toContain('StreetAddress')
    expect(xml).toContain('Zip Code')
    expect(xml).toContain('EmergencyContactName')
    expect(xml).toContain('ss:ID="EmptyCell"')
    expect(xml).toContain('ss:StyleID="EmptyCell"')
    expect(xml).toContain('ss:Width=')
    expect(xml).toContain('FreezePanes')
    expect(xml).toContain('#0F172A')
  })

  it('studio: presets, filtro de filas y opciones de estilo', () => {
    expect(resolveLiftersColumnKeys({ preset: 'minimal' })).toEqual(LIFTERS_EXPORT_PRESETS.minimal)
    expect(resolveLiftersColumnKeys({ preset: 'official' })).not.toContain('divisionEntered')
    expect(normalizeLiftersExportOptions({ preset: 'nope', highlightEmpty: '0' })).toMatchObject({
      preset: 'audit',
      highlightEmpty: false,
    })

    const rows = buildLiftersExportRows(
      [
        { id: 'r1', athleteId: 'a1', category: 'Raw', division: 'Open' },
        { id: 'r2', athleteId: 'a2', category: 'Raw', division: 'Open' },
      ],
      [athlete, { ...athlete, id: 'a2', fullName: 'Incompleto', streetAddress: '', postalCode: '' }],
      [],
    )
    expect(filterLiftersRowsByCompleteness(rows, 'incomplete')).toHaveLength(1)
    expect(previewLiftersExport(rows, { preset: 'minimal', rowFilter: 'complete' })).toEqual({
      rowCount: 1,
      columnCount: LIFTERS_EXPORT_PRESETS.minimal.length,
      columns: [...LIFTERS_EXPORT_PRESETS.minimal],
      rowFilter: 'complete',
      preset: 'minimal',
    })

    const minimalXml = serializeLiftersSpreadsheet(rows, 'Lifters', {
      preset: 'minimal',
      highlightEmpty: false,
      freezeHeader: false,
      includeSummarySheet: false,
    })
    expect(minimalXml).toContain('Birth Date')
    expect(minimalXml).not.toContain('StreetAddress')
    expect(minimalXml).not.toContain('ss:StyleID="EmptyCell"')
    expect(minimalXml).not.toContain('FreezePanes')

    const incompleteOnly = serializeLiftersSpreadsheet(rows, 'Lifters', {
      rowFilter: 'incomplete',
      preset: 'contact',
      includeSummarySheet: false,
    })
    expect(incompleteOnly).toContain('Incompleto')
    expect(incompleteOnly).not.toContain('Gonzalo Taborrelli')
  })

  it('incluye hoja Summary con ranking de gaps', () => {
    const rows = buildLiftersExportRows(
      [
        { id: 'r1', athleteId: 'a1', category: 'Raw', division: 'Open' },
        { id: 'r2', athleteId: 'a2', category: 'Raw', division: 'Open' },
      ],
      [athlete, { ...athlete, id: 'a2', fullName: 'Incompleto', streetAddress: '', postalCode: '' }],
      [],
    )
    const summary = buildLiftersSummarySheet(rows)
    expect(summary.sheetName).toBe('Summary')
    expect(summary.rows.some((row) => row.Type === 'Empty field' && row.Notes === 'postalCode')).toBe(
      true,
    )
    expect(summary.rows.some((row) => row.Type === 'Incomplete athlete')).toBe(true)

    const withSummary = serializeLiftersSpreadsheet(rows, 'Lifters', {
      includeSummarySheet: true,
    })
    expect(withSummary).toContain('ss:Name="Summary"')
    expect(withSummary).toContain('Empty field')
    expect(withSummary).toContain('Incomplete athlete')

    const withoutSummary = serializeLiftersSpreadsheet(rows, 'Lifters', {
      includeSummarySheet: false,
    })
    expect(withoutSummary).not.toContain('ss:Name="Summary"')
  })
})
