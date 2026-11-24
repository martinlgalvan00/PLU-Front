import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import readXlsxFile from 'read-excel-file/node'
import {
  buildRegistrationSheetRows,
  diffRegistrationImportRow,
  parseModalitiesCell,
  parseRegistrationSheet,
  REGISTRATION_IMPORT_MAX_ROWS,
  REGISTRATION_SHEET_COLUMNS,
  REGISTRATION_SHEET_NAME,
} from '../shared/registrationSheet.js'
import { buildRegistrationWorkbook } from '../src/services/registrationSheetService.js'
import { normalizeEventOffering } from '../shared/eventOffering.js'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

const REGISTRATIONS = [
  {
    id: ID_A,
    athleteId: 'ath-a',
    eventSlug: 'barbell-submission-2027',
    event: 'Barbell Submission',
    division: 'Junior',
    secondaryDivision: 'Open',
    category: 'Raw',
    modalities: ['full_power', 'bench'],
    declaredWeightClass: '67,5',
    bodyweight: 66.4,
    status: 'confirmada',
    paymentOrderId: 'pay-a',
    createdAt: '2026-10-20T15:30:00Z',
  },
  {
    id: ID_B,
    athleteId: 'ath-b',
    eventSlug: 'barbell-submission-2027',
    event: 'Barbell Submission',
    division: 'Open',
    category: 'Raw With Wraps',
    modalities: ['push_pull'],
    declaredWeightClass: '90',
    bodyweight: null,
    status: 'pendiente_pago',
  },
]
const ATHLETES = [
  { id: 'ath-a', fullName: 'Lucía Prueba', documentId: '30111222', email: 'lu@x.com', sex: 'Femenino' },
  { id: 'ath-b', fullName: 'Juan Prueba', documentId: '30222333', email: 'ju@x.com', sex: 'Masculino' },
]
const PAYMENTS = [{ id: 'pay-a', status: 'aprobado' }]

const current = (overrides = {}) => ({
  division: 'Junior',
  secondaryDivision: '',
  category: 'Raw',
  modalities: ['full_power'],
  declaredWeightClass: '67,5',
  bodyweightKg: 66,
  status: 'confirmada',
  sex: 'Femenino',
  rosterFrozen: false,
  offering: normalizeEventOffering(null),
  ...overrides,
})

/** Matriz como la devuelve read-excel-file: encabezado + filas. */
function sheet(rows, headers = REGISTRATION_SHEET_COLUMNS.map((column) => column.header)) {
  return [headers, ...rows]
}

describe('buildRegistrationSheetRows', () => {
  it('arma una fila por inscripción con atleta, pago y modalidades legibles', () => {
    const rows = buildRegistrationSheetRows({
      registrations: REGISTRATIONS,
      athletes: ATHLETES,
      payments: PAYMENTS,
    })

    expect(rows[0]).toMatchObject({
      registrationId: ID_A,
      event: 'Barbell Submission',
      athlete: 'Lucía Prueba',
      document: '30111222',
      sex: 'Femenino',
      division: 'Junior',
      secondaryDivision: 'Open',
      modalities: 'Full Power + Banco',
      declaredWeightClass: '67,5',
      bodyweightKg: 66.4,
      paymentStatus: 'aprobado',
      createdAt: '20/10/2026',
    })
    expect(rows[1]).toMatchObject({ bodyweightKg: '', paymentStatus: '', modalities: 'Push-Pull' })
  })
})

describe('parseModalitiesCell', () => {
  it('acepta nombres de la planilla, códigos y separadores', () => {
    expect(parseModalitiesCell('Full Power + Banco')).toEqual({
      ok: true,
      modalities: ['full_power', 'bench'],
    })
    expect(parseModalitiesCell('push-pull')).toEqual({ ok: true, modalities: ['push_pull'] })
    expect(parseModalitiesCell('Sentadilla, peso muerto')).toEqual({
      ok: true,
      modalities: ['squat', 'deadlift'],
    })
    expect(parseModalitiesCell('full_power')).toEqual({ ok: true, modalities: ['full_power'] })
  })

  it('marca la modalidad desconocida', () => {
    expect(parseModalitiesCell('Full Power + Strongman')).toEqual({ ok: false, value: 'strongman' })
  })
})

describe('parseRegistrationSheet', () => {
  it('lee las columnas editables y deja vacío como "no cambiar"', () => {
    const result = parseRegistrationSheet(
      sheet([
        [ID_A, 'Barbell', 'Lucía', '', '', 'Femenino', 'sub masters', 'Open', 'raw', 'Full Power + Banco', '67.5', '66,5', '', '', ''],
        [ID_B, 'Barbell', 'Juan', '', '', 'Masculino', '', '', '', '', '', '', '', '', ''],
      ]),
    )

    expect(result.ok).toBe(true)
    expect(result.rows).toEqual([
      {
        row: 2,
        registrationId: ID_A,
        values: {
          division: 'Sub-Masters',
          category: 'Raw',
          modalities: ['full_power', 'bench'],
          declaredWeightClass: '67,5',
          bodyweightKg: 66.5,
        },
      },
      { row: 3, registrationId: ID_B, values: {} },
    ])
  })

  it('reconoce los encabezados con la marca ✎ y alias, y avisa columnas desconocidas', () => {
    const result = parseRegistrationSheet([
      ['Planilla exportada el 26/10'],
      ['ID', 'Peso ✎', 'Categoría de competencia', 'Notas'],
      [ID_A, 70, 'Single-Ply', 'algo'],
    ])

    expect(result.ok).toBe(true)
    expect(result.rows[0]).toEqual({
      row: 3,
      registrationId: ID_A,
      values: { bodyweightKg: 70, category: 'Single-Ply' },
    })
    expect(result.unknownColumns).toEqual(['Notas'])
  })

  it('reporta IDs inválidos, duplicados y celdas ilegibles por fila', () => {
    const result = parseRegistrationSheet(
      sheet(
        [
          ['no-es-un-id', '', '', '', '', '', 'Open'],
          [ID_A, '', '', '', '', '', 'Open'],
          [ID_A, '', '', '', '', '', 'Junior'],
          [ID_B, '', '', '', '', '', '', '', '', 'Strongman', '', 'pesado'],
        ],
      ),
    )

    expect(result.issues).toEqual([
      { row: 2, field: 'registrationId', code: 'ID_INVALID', value: 'no-es-un-id' },
      { row: 4, field: 'registrationId', code: 'ID_DUPLICATED', value: '3' },
      { row: 5, field: 'modalities', code: 'MODALITY_INVALID', value: 'strongman' },
      { row: 5, field: 'bodyweightKg', code: 'BODYWEIGHT_INVALID', value: 'pesado' },
    ])
    expect(result.rows.map((row) => row.registrationId)).toEqual([ID_A, ID_B])
  })

  it('sin columna de ID, sin columnas editables o vacía no es una planilla válida', () => {
    expect(parseRegistrationSheet([['Nombre', 'División'], ['x', 'Open']]).error).toBe('NO_HEADER')
    expect(parseRegistrationSheet([['ID inscripción', 'Atleta'], [ID_A, 'x']]).error).toBe(
      'NO_EDITABLE_COLUMNS',
    )
    expect(parseRegistrationSheet(sheet([])).error).toBe('EMPTY')
  })

  it(`rechaza más de ${REGISTRATION_IMPORT_MAX_ROWS} filas`, () => {
    const rows = Array.from({ length: REGISTRATION_IMPORT_MAX_ROWS + 1 }, (_, index) => [
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      '',
      '',
      '',
      '',
      '',
      'Open',
    ])
    expect(parseRegistrationSheet(sheet(rows)).error).toBe('TOO_MANY_ROWS')
  })
})

describe('diffRegistrationImportRow', () => {
  it('lista solo lo que cambia', () => {
    const { changes, errors } = diffRegistrationImportRow(current(), {
      division: 'Junior',
      category: 'Raw With Wraps',
      modalities: ['full_power', 'bench'],
      bodyweightKg: 66,
    })

    expect(errors).toEqual([])
    expect(changes).toEqual([
      { field: 'category', from: 'Raw', to: 'Raw With Wraps' },
      { field: 'modalities', from: ['full_power'], to: ['full_power', 'bench'] },
    ])
  })

  it('valida contra la oferta del evento solo el valor nuevo', () => {
    const offering = normalizeEventOffering({ categories: ['Raw'], modalities: ['full_power'] })
    const { errors } = diffRegistrationImportRow(current({ offering }), {
      category: 'Single-Ply',
      modalities: ['bench'],
    })
    expect(errors.map((error) => error.code)).toEqual([
      'OFFERING_CATEGORY_UNAVAILABLE',
      'OFFERING_MODALITY_UNAVAILABLE',
    ])
  })

  it('la categoría de peso tiene que existir para el sexo del atleta', () => {
    expect(
      diffRegistrationImportRow(current({ sex: 'Masculino' }), { declaredWeightClass: '44' }).errors,
    ).toEqual([{ field: 'declaredWeightClass', code: 'WEIGHT_CLASS_INVALID', value: '44' }])
  })

  it('no deja que la división pise la segunda división ya cobrada', () => {
    expect(
      diffRegistrationImportRow(current({ secondaryDivision: 'Open' }), { division: 'Open' })
        .errors[0].code,
    ).toBe('DIVISION_EQUALS_SECONDARY')
  })

  it('no toca inscripciones canceladas ni padrones cerrados', () => {
    const codes = (overrides) =>
      diffRegistrationImportRow(current(overrides), { category: 'Single-Ply' }).errors.map(
        (error) => error.code,
      )
    expect(codes({ status: 'cancelada' })).toEqual(['REGISTRATION_CANCELLED'])
    expect(codes({ rosterFrozen: true })).toEqual(['ROSTER_FROZEN'])
    // Sin cambios no hay nada que bloquear.
    expect(
      diffRegistrationImportRow(current({ status: 'cancelada' }), { category: 'Raw' }).errors,
    ).toEqual([])
  })

  it('corregir división o categoría exige un peso corporal', () => {
    expect(
      diffRegistrationImportRow(current({ bodyweightKg: null }), { division: 'Open' }).errors,
    ).toEqual([{ field: 'bodyweightKg', code: 'BODYWEIGHT_REQUIRED' }])
  })

  it('avisa (sin bloquear) si el peso supera la categoría', () => {
    const result = diffRegistrationImportRow(current(), { bodyweightKg: 70 })
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([{ field: 'bodyweightKg', code: 'BODYWEIGHT_OVER_CLASS' }])
  })
})

describe('planilla .xlsx de ida y vuelta', () => {
  it('lo que se exporta se vuelve a leer igual (y sin cambios no hay diff)', async () => {
    const rows = buildRegistrationSheetRows({
      registrations: REGISTRATIONS,
      athletes: ATHLETES,
      payments: PAYMENTS,
    })
    const buffer = await writeXlsxFile(buildRegistrationWorkbook(rows)).toBuffer()
    const sheets = await readXlsxFile(buffer)

    expect(sheets.map((item) => item.sheet)).toEqual([REGISTRATION_SHEET_NAME, 'Cómo editar'])
    const parsed = parseRegistrationSheet(sheets[0].data)
    expect(parsed.ok).toBe(true)
    expect(parsed.issues).toEqual([])
    expect(parsed.rows[0]).toEqual({
      row: 2,
      registrationId: ID_A,
      values: {
        division: 'Junior',
        category: 'Raw',
        modalities: ['full_power', 'bench'],
        declaredWeightClass: '67,5',
        bodyweightKg: 66.4,
      },
    })

    const diff = diffRegistrationImportRow(
      current({
        secondaryDivision: 'Open',
        modalities: ['full_power', 'bench'],
        bodyweightKg: 66.4,
      }),
      parsed.rows[0].values,
    )
    expect(diff.changes).toEqual([])
  })
})
