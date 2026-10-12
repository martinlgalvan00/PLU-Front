import { describe, expect, it } from 'vitest'
import {
  LEDGER_PASTE_MAX_ROWS,
  isLedgerGridPaste,
  parseLedgerAmount,
  parseLedgerDate,
  parseLedgerPaste,
} from '../src/lib/ledgerPaste.js'

describe('parseLedgerDate', () => {
  it('lee dd/mm/aaaa, dd-mm-aa y aaaa-mm-dd', () => {
    expect(parseLedgerDate('05/10/2026')).toBe('2026-10-05')
    expect(parseLedgerDate('5-10-26')).toBe('2026-10-05')
    expect(parseLedgerDate('2026-10-05')).toBe('2026-10-05')
  })

  it('rechaza fechas que no existen', () => {
    expect(parseLedgerDate('31/02/2026')).toBeNull()
    expect(parseLedgerDate('hola')).toBeNull()
    expect(parseLedgerDate('')).toBeNull()
  })
})

describe('parseLedgerAmount', () => {
  it('entiende el formato argentino y el inglés', () => {
    expect(parseLedgerAmount('1.500,50')).toBe(1500.5)
    expect(parseLedgerAmount('1,500.50')).toBe(1500.5)
    expect(parseLedgerAmount('$ 25.000')).toBe(25000)
    expect(parseLedgerAmount('25000')).toBe(25000)
    expect(parseLedgerAmount('1.234.567')).toBe(1234567)
  })

  it('un punto con tres dígitos es de miles, no decimal', () => {
    expect(parseLedgerAmount('1.500')).toBe(1500)
    expect(parseLedgerAmount('15,5')).toBe(15.5)
  })

  it('los negativos y los paréntesis restan', () => {
    expect(parseLedgerAmount('-3.000')).toBe(-3000)
    expect(parseLedgerAmount('(3.000)')).toBe(-3000)
  })

  it('devuelve null si no es un número', () => {
    expect(parseLedgerAmount('abc')).toBeNull()
    expect(parseLedgerAmount('')).toBeNull()
  })
})

describe('isLedgerGridPaste', () => {
  it('un valor de una celda se pega normal', () => {
    expect(isLedgerGridPaste('Logística')).toBe(false)
    expect(isLedgerGridPaste('Logística\r\n')).toBe(false)
  })

  it('varias celdas o varias filas son una grilla', () => {
    expect(isLedgerGridPaste('a\tb')).toBe(true)
    expect(isLedgerGridPaste('a\nb')).toBe(true)
  })
})

describe('parseLedgerPaste', () => {
  const today = '2026-10-11'

  it('lee filas de cuatro columnas con tabuladores', () => {
    const { rows } = parseLedgerPaste(
      '05/10/2026\tLogística\tAlquiler de discos\t38.000\n06/10/2026\tPremios\tMedallas Open\t21.000',
      { defaultKind: 'expense', today },
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      kind: 'expense',
      occurredOn: '2026-10-05',
      category: 'Logística',
      description: 'Alquiler de discos',
      amount: 38000,
      errors: [],
    })
  })

  it('con tres columnas usa la fecha de hoy', () => {
    const { rows } = parseLedgerPaste('Sponsor\tAporte Gym Titan\t150000', {
      defaultKind: 'income',
      today,
    })

    expect(rows[0]).toMatchObject({ occurredOn: today, kind: 'income', amount: 150000, errors: [] })
  })

  it('descarta una fila de títulos', () => {
    const { rows, hadHeader } = parseLedgerPaste(
      'Fecha\tCategoría\tDetalle\tImporte\n05/10/2026\tLogística\tFlete de discos\t9000',
      { today },
    )

    expect(hadHeader).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].line).toBe(2)
  })

  it('el tipo sale de la quinta columna', () => {
    const { rows } = parseLedgerPaste(
      '05/10/2026\tSponsor\tAporte anual\t100000\tIngreso\n05/10/2026\tLogística\tFlete\t9000\tEgreso',
      { defaultKind: 'expense', today },
    )

    expect(rows.map((row) => row.kind)).toEqual(['income', 'expense'])
  })

  it('un importe negativo sin tipo es egreso y se guarda en positivo', () => {
    const { rows } = parseLedgerPaste('05/10/2026\tLogística\tFlete de discos\t-9.000', {
      defaultKind: 'income',
      today,
    })

    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 9000, errors: [] })
  })

  it('marca qué falla en cada fila sin descartar las demás', () => {
    const { rows } = parseLedgerPaste(
      '31/02/2026\tLogística\tFlete de discos\t9000\n05/10/2026\tX\tAb\tabc\n05/10/2026\tPremios\tMedallas\t5000',
      { today },
    )

    expect(rows[0].errors).toEqual(['date'])
    expect(rows[1].errors).toEqual(['category', 'description', 'amount'])
    expect(rows[2].errors).toEqual([])
  })

  it('un tipo desconocido es un error de esa fila', () => {
    const { rows } = parseLedgerPaste('05/10/2026\tLogística\tFlete de discos\t9000\tquizás', { today })

    expect(rows[0].errors).toEqual(['kind'])
  })

  it('redondea los centavos al peso (la base guarda enteros)', () => {
    const { rows } = parseLedgerPaste('05/10/2026\tLogística\tFlete de discos\t1.500,50', { today })

    expect(rows[0].amount).toBe(1501)
  })

  it('sin tabuladores ni punto y coma no hay grilla', () => {
    expect(parseLedgerPaste('solo una línea', { today }).rows).toEqual([])
  })

  it('acepta punto y coma como separador', () => {
    const { rows } = parseLedgerPaste('05/10/2026;Logística;Flete de discos;9000', { today })

    expect(rows[0].errors).toEqual([])
  })

  it('corta en el máximo de filas e informa que truncó', () => {
    const text = Array.from(
      { length: LEDGER_PASTE_MAX_ROWS + 5 },
      (_, index) => `05/10/2026\tLogística\tMovimiento ${index}\t100`,
    ).join('\n')
    const { rows, truncated } = parseLedgerPaste(text, { today })

    expect(rows).toHaveLength(LEDGER_PASTE_MAX_ROWS)
    expect(truncated).toBe(true)
  })
})
