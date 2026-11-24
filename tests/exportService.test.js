import { describe, expect, it } from 'vitest'
import {
  buildAdminExportRows,
  buildPluUsaExportRows,
  normalizeExportDate,
  serializeCsv,
} from '../shared/exportRows.js'

describe('normalizeExportDate', () => {
  it('devuelve YYYY-MM-DD desde ISO corto', () => {
    expect(normalizeExportDate('1994-05-18')).toBe('1994-05-18')
  })

  it('recorta ISO largo sin usar Date', () => {
    expect(normalizeExportDate('1994-05-18T03:00:00.000Z')).toBe('1994-05-18')
  })

  it('vacío / null / basura → string vacío', () => {
    expect(normalizeExportDate(null)).toBe('')
    expect(normalizeExportDate(undefined)).toBe('')
    expect(normalizeExportDate('')).toBe('')
    expect(normalizeExportDate('no-es-fecha')).toBe('')
  })
})

describe('buildAdminExportRows', () => {
  it('incluye fecha_nacimiento normalizada', () => {
    const rows = buildAdminExportRows(
      [{ athleteId: 'a1', division: 'Open', category: '-83', bodyweight: 82, event: 'Pitbull', status: 'confirmada' }],
      [
        {
          id: 'a1',
          fullName: 'Ana López',
          documentId: '30111222',
          email: 'ana@example.com',
          birthDate: '1998-04-12T12:00:00.000Z',
          phone: '11',
          country: 'Argentina',
          province: 'CABA',
          city: 'CABA',
          gym: 'PLU',
          sex: 'F',
        },
      ],
      [{ athleteId: 'a1', memberCode: 'PLU-1', status: 'activa' }],
      [{ athleteId: 'a1', status: 'aprobado', reference: 'mp-1' }],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].fecha_nacimiento).toBe('1998-04-12')
    expect(rows[0].atleta).toBe('Ana López')
    expect(rows[0].codigo_afiliado).toBe('PLU-1')
  })

  it('sin atleta en el join no rompe y deja DOB vacío', () => {
    const rows = buildAdminExportRows(
      [{ athleteId: 'missing', event: 'X', status: 'pendiente_pago' }],
      [],
      [],
      [],
    )
    expect(rows[0].atleta).toBe('')
    expect(rows[0].fecha_nacimiento).toBe('')
  })

  it('calcula division por DOB al día del evento', () => {
    const rows = buildAdminExportRows(
      [
        {
          athleteId: 'a1',
          division: 'Open',
          category: 'Raw',
          event: 'Pitbull',
          status: 'confirmada',
          eventStartsAt: '2026-10-19',
        },
      ],
      [
        {
          id: 'a1',
          fullName: 'Junior Export',
          birthDate: '2005-06-01',
          sex: 'M',
        },
      ],
      [],
      [],
    )
    expect(rows[0].division).toBe('Junior')
    expect(rows[0].division_inscrita).toBe('Open')
    expect(rows[0].division_desajuste).toBe('')
    expect(rows[0].division_open_upgrade).toBe('1')
  })
})

describe('buildPluUsaExportRows', () => {
  it('normaliza birth_date y fechas de membresía', () => {
    const rows = buildPluUsaExportRows(
      [
        {
          id: 'a1',
          fullName: 'Juan Perez',
          documentId: '20111222',
          birthDate: '1990-01-02',
          sex: 'M',
          country: 'Argentina',
          province: 'BA',
          city: 'La Plata',
          gym: 'Gym',
          division: 'Open',
          category: '-93',
          estimatedWeight: 90,
        },
      ],
      [
        {
          athleteId: 'a1',
          memberCode: 'USA-1',
          year: 2026,
          status: 'activa',
          startDate: '2026-01-01T00:00:00.000Z',
          expirationDate: '2026-12-31',
        },
      ],
      [
        {
          athleteId: 'a1',
          division: 'Open',
          category: '-93',
          bodyweight: 91,
          event: 'Spring',
          status: 'confirmada',
          paymentStatus: 'aprobado',
        },
      ],
    )

    expect(rows[0].birth_date).toBe('1990-01-02')
    expect(rows[0].membership_start).toBe('2026-01-01')
    expect(rows[0].membership_expiration).toBe('2026-12-31')
    expect(rows[0].first_name).toBe('Juan')
    expect(rows[0].last_name).toBe('Perez')
  })

  it('birthDate null → celda vacía', () => {
    const rows = buildPluUsaExportRows(
      [{ id: 'a1', fullName: 'Solo', birthDate: null }],
      [],
      [],
    )
    expect(rows[0].birth_date).toBe('')
  })

  it('calcula division por DOB aunque athlete.division diga Open', () => {
    const rows = buildPluUsaExportRows(
      [
        {
          id: 'a1',
          fullName: 'Youth Athlete',
          birthDate: '2015-01-01',
          sex: 'F',
          division: 'Open',
        },
      ],
      [],
      [{ athleteId: 'a1', division: 'Open', eventStartsAt: '2026-10-19' }],
    )
    expect(rows[0].division).toBe('Youth')
    expect(rows[0].division_entered).toBe('Open')
    expect(rows[0].division_mismatch).toBe('')
    expect(rows[0].division_open_upgrade).toBe('1')
  })
})

describe('serializeCsv', () => {
  it('agrega BOM UTF-8 y escapa comillas', () => {
    const csv = serializeCsv([{ nombre: 'Ana "PLU"', fecha_nacimiento: '1990-01-01' }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Ana ""PLU"""')
    expect(csv).toContain('fecha_nacimiento')
  })

  it('sin filas → null', () => {
    expect(serializeCsv([])).toBeNull()
  })
})
