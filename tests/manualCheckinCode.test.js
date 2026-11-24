import { describe, expect, it } from 'vitest'
import {
  checkinLookupQuery,
  formatTicketCode,
  needsCheckinLookup,
  parseManualCheckinCode,
} from '../src/lib/manualCheckinCode.js'

/**
 * Lo que tipea un guardia cuando el QR no se lee y la persona no tiene a mano
 * su código de puerta (ese lo interpreta `prepareCheckinScan`): el número
 * impreso de la compra o el DNI.
 */
describe('parseManualCheckinCode', () => {
  it.each([
    ['TCK-00000412', 'TCK-00000412'],
    ['tck 412', 'TCK-00000412'],
    ['tck-412', 'TCK-00000412'],
    ['TCK412', 'TCK-00000412'],
    ['#412', 'TCK-00000412'],
    ['412', 'TCK-00000412'],
    // Con prefijo, un número largo sigue siendo de compra aunque parezca DNI.
    ['TCK-12345678', 'TCK-12345678'],
  ])('lee "%s" como el número de compra %s', (raw, ticketCode) => {
    expect(parseManualCheckinCode(raw)).toEqual({ kind: 'ticket_code', ticketCode })
  })

  it.each([
    ['30111222', '30111222'],
    ['30.111.222', '30111222'],
    ['  7 654 321 ', '7654321'],
  ])('lee "%s" como DNI', (raw, dni) => {
    expect(parseManualCheckinCode(raw)).toEqual({ kind: 'dni', dni })
  })

  it('deja todo lo demás para el flujo de siempre (QR, código de puerta, socio)', () => {
    expect(parseManualCheckinCode('https://plu-arg.com/c?credencial=abc&tipo=ticket')).toBeNull()
    expect(parseManualCheckinCode('K4M-7QP')).toBeNull()
    expect(parseManualCheckinCode('PLU-2026-0042')).toBeNull()
    expect(parseManualCheckinCode('   ')).toBeNull()
    expect(parseManualCheckinCode('0')).toBeNull()
  })

  it('arma el cuerpo de la búsqueda', () => {
    expect(checkinLookupQuery(parseManualCheckinCode('412'))).toEqual({ ticketCode: 'TCK-00000412' })
    expect(checkinLookupQuery(parseManualCheckinCode('30111222'))).toEqual({ dni: '30111222' })
    expect(needsCheckinLookup(parseManualCheckinCode('K4M-7QP'))).toBe(false)
  })

  it('formatea igual que la secuencia de la base', () => {
    expect(formatTicketCode(7)).toBe('TCK-00000007')
  })
})
