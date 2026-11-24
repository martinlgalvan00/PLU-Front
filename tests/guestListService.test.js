import { describe, expect, it } from 'vitest'
import {
  GUEST_LIST_MAX,
  guestStatus,
  parseGuestList,
  summarizeGuests,
} from '../src/services/guestListService.js'

describe('parseGuestList', () => {
  it('reconoce las columnas por su forma, no por su posición', () => {
    const { guests, invalid } = parseGuestList(
      [
        'Ana Pérez, 30.111.222, ana@medio.com',
        '28999888; Juan Gómez',
        'luis@sponsor.com\tLuis Díaz\t27111222',
      ].join('\n'),
    )
    expect(invalid).toEqual([])
    expect(guests.map(({ fullName, dni, email }) => ({ fullName, dni, email }))).toEqual([
      { fullName: 'Ana Pérez', dni: '30111222', email: 'ana@medio.com' },
      { fullName: 'Juan Gómez', dni: '28999888', email: '' },
      { fullName: 'Luis Díaz', dni: '27111222', email: 'luis@sponsor.com' },
    ])
  })

  it('descarta el encabezado de la planilla y las líneas vacías', () => {
    const { guests, invalid } = parseGuestList('Nombre,DNI,Email\n\nAna Pérez,30111222,\n')
    expect(invalid).toEqual([])
    expect(guests).toHaveLength(1)
  })

  it('informa cada línea que no se va a poder cargar y por qué', () => {
    const { guests, invalid } = parseGuestList(
      ['Ana Pérez, 30111222', 'Sin DNI', 'Al, 30111333', 'Bea Ruiz, 30111444, bea@', 'Ana Otra, 30111222'].join('\n'),
    )
    expect(guests).toHaveLength(1)
    expect(invalid.map((item) => [item.line, item.reason])).toEqual([
      [2, 'dni'],
      [3, 'name'],
      [4, 'email'],
      [5, 'duplicate'],
    ])
  })

  it('corta en el máximo que acepta el servidor y lo avisa', () => {
    const raw = Array.from(
      { length: GUEST_LIST_MAX + 5 },
      (_, index) => `Invitado ${index}, ${String(30000000 + index)}`,
    ).join('\n')
    const { guests, truncated } = parseGuestList(raw)
    expect(guests).toHaveLength(GUEST_LIST_MAX)
    expect(truncated).toBe(true)
  })
})

describe('estado de una invitación', () => {
  it('la baja manda sobre el ingreso', () => {
    expect(guestStatus({ status: 'cancelado', checkedInAt: '2026-12-12T10:00:00Z' })).toBe(
      'cancelled',
    )
    expect(guestStatus({ status: 'aprobado', checkedInAt: '2026-12-12T10:00:00Z' })).toBe(
      'checked_in',
    )
    expect(guestStatus({ status: 'aprobado' })).toBe('active')
  })

  it('el resumen no cuenta las dadas de baja', () => {
    expect(
      summarizeGuests([
        { status: 'aprobado' },
        { status: 'aprobado', checkedInAt: '2026-12-12T10:00:00Z' },
        { status: 'cancelado' },
      ]),
    ).toEqual({ active: 2, checkedIn: 1 })
  })
})
