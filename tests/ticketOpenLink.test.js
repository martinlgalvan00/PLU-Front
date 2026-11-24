import { describe, expect, it } from 'vitest'
import {
  attachStaffBuyerOpenKeys,
  signTicketOpenKey,
  ticketOpenKeyMatches,
  withSignedTicketOpenUrl,
} from '../server/modules/ticketing/ticketOpenLink.js'

describe('clave de apertura del mail de entradas', () => {
  it('abre la referencia firmada y rechaza otra referencia o una firma rota', () => {
    const key = signTicketOpenKey('TORD-abc123')
    expect(key).toEqual(expect.any(String))
    expect(ticketOpenKeyMatches('TORD-abc123', key)).toBe(true)
    expect(ticketOpenKeyMatches('TORD-otra', key)).toBe(false)
    expect(ticketOpenKeyMatches('TORD-abc123', `${key}x`)).toBe(false)
    expect(ticketOpenKeyMatches('TORD-abc123', '')).toBe(false)
  })

  it('agrega la firma al enlace y no la duplica', () => {
    const url = withSignedTicketOpenUrl('https://plu.test/entradas?ref=TORD-abc123', 'TORD-abc123')
    const key = signTicketOpenKey('TORD-abc123')
    expect(url).toBe(`https://plu.test/entradas?ref=TORD-abc123&k=${key}`)
    expect(withSignedTicketOpenUrl(url, 'TORD-abc123')).toBe(url)
    expect(withSignedTicketOpenUrl('', 'TORD-abc123')).toBe('')
  })

  it('firma sólo las entradas pagas y reutiliza la clave de la misma orden', () => {
    const rows = attachStaffBuyerOpenKeys([
      { ticket: { status: 'pagada' }, order: { reference: 'TORD-abc123' } },
      { ticket: { status: 'pagada' }, order: { reference: 'TORD-abc123' } },
      { ticket: { status: 'pendiente_pago' }, order: { reference: 'TORD-otra' } },
      { ticket: { status: 'pagada' }, order: null },
    ])
    const key = signTicketOpenKey('TORD-abc123')
    expect(rows[0].order.openKey).toBe(key)
    expect(rows[1].order.openKey).toBe(key)
    expect(rows[2].order.openKey).toBeUndefined()
    expect(rows[3].order).toBeNull()
  })
})
