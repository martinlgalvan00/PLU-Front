import { describe, expect, it } from 'vitest'
import {
  checkinLookupQuery,
  formatDoorCode,
  formatTicketCode,
  needsCheckinLookup,
  parseManualCheckinCode,
} from '../src/lib/manualCheckinCode.js'

/**
 * Lo que tipea un guardia cuando el QR no se lee. El QR lleva un UUID que nadie
 * puede dictar; lo que la persona tiene a mano es el código impreso de su
 * entrada y su DNI.
 */
describe('parseManualCheckinCode', () => {
  it.each([
    ['482913', '482913'],
    ['482 913', '482913'],
    ['482-913', '482913'],
    [' 482.913 ', '482913'],
  ])('lee "%s" como el código de puerta %s', (raw, doorCode) => {
    expect(parseManualCheckinCode(raw)).toEqual({ kind: 'door_code', doorCode })
  })

  it('un 6 dígitos con cero adelante no es código de puerta (se emiten desde 100000)', () => {
    expect(parseManualCheckinCode('012345')).toEqual({
      kind: 'ticket_code',
      ticketCode: 'TCK-00012345',
    })
  })

  it.each([
    ['TCK-00000412', 'TCK-00000412'],
    ['tck 412', 'TCK-00000412'],
    ['tck-412', 'TCK-00000412'],
    ['TCK412', 'TCK-00000412'],
    ['#412', 'TCK-00000412'],
    ['412', 'TCK-00000412'],
    ['000412', 'TCK-00000412'],
    // Con prefijo, un número largo sigue siendo de entrada aunque parezca DNI.
    ['TCK-12345678', 'TCK-12345678'],
  ])('lee "%s" como el número de entrada %s', (raw, ticketCode) => {
    expect(parseManualCheckinCode(raw)).toEqual({ kind: 'ticket_code', ticketCode })
  })

  it.each([
    ['30111222', '30111222'],
    ['30.111.222', '30111222'],
    ['  7 654 321 ', '7654321'],
  ])('lee "%s" como DNI', (raw, dni) => {
    expect(parseManualCheckinCode(raw)).toEqual({ kind: 'dni', dni })
  })

  it('deja el QR (URL o UUID) para el flujo de escaneo de siempre', () => {
    expect(parseManualCheckinCode('https://plu-arg.com/c?credencial=abc&tipo=ticket')).toEqual({
      kind: 'qr',
    })
    expect(parseManualCheckinCode('6f1c1e0e-8f6b-4d7a-9a63-1d3b7b2a9c11')).toEqual({ kind: 'qr' })
  })

  it('cualquier otra cosa sigue siendo un código de socio', () => {
    expect(parseManualCheckinCode('PLU-2026-0042')).toEqual({ kind: 'member', code: 'PLU-2026-0042' })
  })

  it('ignora lo vacío y el número 0', () => {
    expect(parseManualCheckinCode('   ')).toBeNull()
    expect(parseManualCheckinCode('0')).toEqual({ kind: 'member', code: '0' })
  })

  it('código de puerta, número de entrada y DNI se buscan antes de validar', () => {
    expect(needsCheckinLookup(parseManualCheckinCode('482913'))).toBe(true)
    expect(needsCheckinLookup(parseManualCheckinCode('412'))).toBe(true)
    expect(needsCheckinLookup(parseManualCheckinCode('30111222'))).toBe(true)
    expect(needsCheckinLookup(parseManualCheckinCode('PLU-2026-0042'))).toBe(false)
    expect(needsCheckinLookup(parseManualCheckinCode('6f1c1e0e-8f6b-4d7a-9a63-1d3b7b2a9c11'))).toBe(
      false,
    )
  })

  it('formatea igual que la secuencia de la base', () => {
    expect(formatTicketCode(7)).toBe('TCK-00000007')
  })

  it('agrupa el código de puerta de a tres para dictarlo', () => {
    expect(formatDoorCode('482913')).toBe('482 913')
    expect(formatDoorCode(null)).toBe('')
  })

  it('arma el cuerpo de la búsqueda para cada forma', () => {
    expect(checkinLookupQuery(parseManualCheckinCode('482 913'))).toEqual({ doorCode: '482913' })
    expect(checkinLookupQuery(parseManualCheckinCode('412'))).toEqual({ ticketCode: 'TCK-00000412' })
    expect(checkinLookupQuery(parseManualCheckinCode('30111222'))).toEqual({ dni: '30111222' })
    expect(checkinLookupQuery(parseManualCheckinCode('PLU-1'))).toBeNull()
  })
})
