import { describe, expect, it } from 'vitest'
import { validateTicketAttendees } from '../src/lib/validation.js'

/**
 * Un DNI por persona. Dos entradas con el mismo documento emiten dos QR, pero
 * en la puerta los dos se verifican contra la misma persona y el segundo
 * rebota: quien compró diez entradas con su propio DNI se entera recién ahí.
 */
const TYPES = ['tt-general', 'tt-palco']

function attendee(overrides = {}) {
  return { fullName: 'Camila Rearte', dni: '38402115', ticketTypeId: 'tt-general', ...overrides }
}

describe('validateTicketAttendees — DNI repetido', () => {
  it('acepta una lista con documentos distintos', () => {
    const result = validateTicketAttendees(
      [attendee(), attendee({ fullName: 'Julián Ferreyra', dni: '41908330' })],
      null,
      TYPES,
    )
    expect(result.success).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('marca la fila repetida y deja limpia la primera', () => {
    const result = validateTicketAttendees(
      [
        attendee(),
        attendee({ fullName: 'Julián Ferreyra', dni: '41908330' }),
        attendee({ fullName: 'Marina Oliveira', dni: '38402115' }),
      ],
      null,
      TYPES,
    )

    expect(result.success).toBe(false)
    expect(result.errors['attendee-0-dni']).toBeUndefined()
    expect(result.errors['attendee-1-dni']).toBeUndefined()
    // Apunta a la entrada 1 (base 1), que es como se numeran en el formulario.
    expect(result.errors['attendee-2-dni']).toMatch(/entrada 1/i)
  })

  it('marca todas las repeticiones, no solo la segunda', () => {
    const result = validateTicketAttendees(
      [attendee(), attendee(), attendee()],
      null,
      TYPES,
    )
    expect(result.errors['attendee-0-dni']).toBeUndefined()
    expect(result.errors['attendee-1-dni']).toBeDefined()
    expect(result.errors['attendee-2-dni']).toBeDefined()
  })

  it('un DNI inválido no cuenta como ocupado para las filas siguientes', () => {
    // Si '123' reservara el lugar, la fila siguiente con el mismo texto saldría
    // como "repetida" en vez de como "DNI inválido", que es el problema real.
    const result = validateTicketAttendees(
      [attendee({ dni: '123' }), attendee({ dni: '123' })],
      null,
      TYPES,
    )
    expect(result.errors['attendee-0-dni']).toMatch(/7 u 8 d/i)
    expect(result.errors['attendee-1-dni']).toMatch(/7 u 8 d/i)
  })

  it('compara sin espacios sobrantes', () => {
    const result = validateTicketAttendees(
      [attendee({ dni: ' 38402115 ' }), attendee({ dni: '38402115' })],
      null,
      TYPES,
    )
    expect(result.errors['attendee-1-dni']).toBeDefined()
  })

  it('sigue validando nombre y tipo de entrada junto al documento', () => {
    const result = validateTicketAttendees(
      [attendee(), attendee({ fullName: 'Al', ticketTypeId: 'nope' })],
      null,
      TYPES,
    )
    expect(result.errors['attendee-1-fullName']).toBeDefined()
    expect(result.errors['attendee-1-ticketTypeId']).toBeDefined()
    expect(result.errors['attendee-1-dni']).toBeDefined()
  })
})
