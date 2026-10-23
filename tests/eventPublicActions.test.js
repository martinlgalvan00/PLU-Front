import { describe, expect, it } from 'vitest'
import { canBuyEventTickets, isEventRegistrationOpen } from '../src/lib/eventPublicActions.js'

const open = { status: 'inscripcion_abierta' }
const withTickets = (extra = {}) => ({
  status: 'proximamente',
  pricing: { ticketsEnabled: true, ticketAddons: [] },
  ...extra,
})

describe('isEventRegistrationOpen', () => {
  it('abre con estado abierto o cupos limitados', () => {
    expect(isEventRegistrationOpen({ status: 'inscripcion_abierta' })).toBe(true)
    expect(isEventRegistrationOpen({ status: 'cupos_limitados' })).toBe(true)
  })

  it('no abre con cualquier otro estado ni sin evento', () => {
    for (const status of ['proximamente', 'cerrado', 'finalizado', 'cupo_lleno', undefined]) {
      expect(isEventRegistrationOpen({ status }), String(status)).toBe(false)
    }
    expect(isEventRegistrationOpen(null)).toBe(false)
  })

  it('las inscripciones apagadas en la plataforma mandan sobre el estado del evento', () => {
    expect(isEventRegistrationOpen(open, { registrationEnabled: false })).toBe(false)
    expect(isEventRegistrationOpen(open, { registrationEnabled: true })).toBe(true)
  })
})

describe('canBuyEventTickets', () => {
  it('necesita la venta habilitada en la plataforma', () => {
    expect(canBuyEventTickets(withTickets(), { config: { ticketSalesEnabled: true } })).toBe(true)
    expect(canBuyEventTickets(withTickets(), { config: { ticketSalesEnabled: false } })).toBe(false)
    expect(canBuyEventTickets(withTickets(), { config: {} })).toBe(false)
  })

  it('necesita entradas activas en el evento', () => {
    const config = { ticketSalesEnabled: true }
    expect(canBuyEventTickets(withTickets({ pricing: { ticketsEnabled: false } }), { config })).toBe(false)
    expect(canBuyEventTickets(null, { config })).toBe(false)
  })

  it('un evento finalizado corta la venta', () => {
    expect(
      canBuyEventTickets(withTickets({ status: 'finalizado' }), { config: { ticketSalesEnabled: true } }),
    ).toBe(false)
  })
})

describe('isEventRegistrationOpen — misma regla que el control de venta', () => {
  const now = new Date('2026-11-01T12:00:00Z')

  it('con la ventana todavía por abrir o ya vencida no ofrece inscribirse', () => {
    expect(
      isEventRegistrationOpen({ ...open, registrationOpensAt: '2026-11-05T00:00:00Z' }, { now }),
    ).toBe(false)
    expect(
      isEventRegistrationOpen({ ...open, registrationClosesAt: '2026-10-30T00:00:00Z' }, { now }),
    ).toBe(false)
    expect(
      isEventRegistrationOpen(
        {
          ...open,
          registrationOpensAt: '2026-10-01T00:00:00Z',
          registrationClosesAt: '2026-11-30T00:00:00Z',
        },
        { now },
      ),
    ).toBe(true)
  })

  it('"Solo anuncio" no ofrece inscribirse', () => {
    expect(isEventRegistrationOpen({ ...open, salesIntent: 'announce' }, { now })).toBe(false)
  })

  it('sin cupo no ofrece inscribirse', () => {
    expect(isEventRegistrationOpen({ ...open, slots: 10, registered: 10 }, { now })).toBe(false)
  })

  it('lee el estado guardado cuando el público ya lo corrigió por la ventana', () => {
    expect(
      isEventRegistrationOpen(
        { status: 'proximamente', storedStatus: 'inscripcion_abierta', registrationOpensAt: '2026-10-01T00:00:00Z' },
        { now },
      ),
    ).toBe(true)
  })
})
