import { describe, expect, it } from 'vitest'
import {
  buildBuyerTicketsUrl,
  buildTicketQrUrl,
  summarizeSoldTickets,
  ticketAdmissionState,
  ticketHasUsableQr,
  ticketQrFileName,
} from '../src/lib/ticketAdmission.js'

const NOW = new Date('2026-12-11T12:00:00.000Z')

function ticket(overrides = {}) {
  return { id: 't1', status: 'pagada', qrToken: 'opaque-token', checkIn: null, ...overrides }
}

describe('ticketAdmissionState', () => {
  it('una entrada cancelada o sin pagar no abre nada, aunque tenga vigencia', () => {
    const validity = {
      validFrom: '2026-12-11T00:00:00.000Z',
      validUntil: '2026-12-12T00:00:00.000Z',
    }
    expect(ticketAdmissionState(ticket({ status: 'cancelada', ...validity }), NOW)).toBe('cancelled')
    expect(ticketAdmissionState(ticket({ status: 'pendiente_pago', ...validity }), NOW)).toBe(
      'unpaid',
    )
  })

  it('una entrada ya ingresada es "used" aunque su vigencia haya vencido', () => {
    const state = ticketAdmissionState(
      ticket({
        checkIn: { scannedAt: '2026-12-11T09:00:00.000Z' },
        validFrom: '2026-12-10T00:00:00.000Z',
        validUntil: '2026-12-11T10:00:00.000Z',
      }),
      NOW,
    )
    expect(state).toBe('used')
  })

  it('distingue vencida, todavía no vigente y habilitada por la vigencia congelada', () => {
    const at = (validFrom, validUntil) => ticket({ validFrom, validUntil })
    expect(ticketAdmissionState(at('2026-12-10T00:00:00Z', '2026-12-11T00:00:00Z'), NOW)).toBe(
      'expired',
    )
    expect(ticketAdmissionState(at('2026-12-12T00:00:00Z', '2026-12-13T00:00:00Z'), NOW)).toBe(
      'upcoming',
    )
    expect(ticketAdmissionState(at('2026-12-11T00:00:00Z', '2026-12-12T00:00:00Z'), NOW)).toBe(
      'ready',
    )
  })

  it('sin vigencia cargada la entrada pagada se considera habilitada', () => {
    expect(ticketAdmissionState(ticket(), NOW)).toBe('ready')
  })
})

describe('ticketHasUsableQr', () => {
  it('sólo hay QR utilizable con la entrada pagada y con token', () => {
    expect(ticketHasUsableQr(ticket())).toBe(true)
    expect(ticketHasUsableQr(ticket({ status: 'pendiente_pago' }))).toBe(false)
    expect(ticketHasUsableQr(ticket({ status: 'cancelada' }))).toBe(false)
    expect(ticketHasUsableQr(ticket({ qrToken: null }))).toBe(false)
  })
})

describe('buildTicketQrUrl', () => {
  it('lleva el token opaco, el evento y el tipo "ticket", nunca el código humano', () => {
    const url = new URL(
      buildTicketQrUrl(ticket({ ticketCode: 'TCK-00000001' }), 'pitbull-classic'),
    )
    expect(url.searchParams.get('credencial')).toBe('opaque-token')
    expect(url.searchParams.get('evento')).toBe('pitbull-classic')
    expect(url.searchParams.get('tipo')).toBe('ticket')
    expect(url.toString()).not.toContain('TCK-00000001')
  })
})

describe('buildBuyerTicketsUrl', () => {
  it('arma el enlace a "Mis entradas" con la referencia y devuelve vacío sin ella', () => {
    expect(buildBuyerTicketsUrl('TORD-abc 1')).toMatch(/\/entradas\?ref=TORD-abc%201$/)
    expect(buildBuyerTicketsUrl(null)).toBe('')
  })
})

describe('summarizeSoldTickets', () => {
  it('cuenta emitidas, pagadas, pendientes e ingresos (sólo de pagadas)', () => {
    const summary = summarizeSoldTickets([
      ticket({ id: 'a', checkIn: { scannedAt: '2026-12-11T10:00:00Z' } }),
      ticket({ id: 'b' }),
      ticket({ id: 'c', status: 'pendiente_pago' }),
      ticket({ id: 'd', status: 'cancelada', checkIn: { scannedAt: '2026-12-11T10:00:00Z' } }),
    ])
    expect(summary).toEqual({ issued: 4, paid: 2, pending: 1, checkedIn: 1 })
  })
})

describe('ticketQrFileName', () => {
  it('usa el código de la entrada y no deja caracteres peligrosos', () => {
    expect(ticketQrFileName({ ticketCode: 'TCK-0001' })).toBe('qr-TCK-0001.png')
    expect(ticketQrFileName({ ticketCode: '../x y' })).not.toMatch(/[\\/ ]/)
  })
})
