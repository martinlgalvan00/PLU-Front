import { describe, expect, it } from 'vitest'
import {
  allOpenEventPaymentChannelOverrides,
  applyEventChannelOpens,
  effectiveEventChannelsFor,
  eventChannelFlagFor,
  eventChannelOverridesFor,
  isEventChannelForcedOpen,
  resolveEventChannelState,
  setEventChannelFlag,
  isEventChannelOpenAnywhere,
  isEventChannelOpenForConcept,
  normalizeEventPaymentChannelOverrides,
  openEventChannelsFor,
} from '../src/lib/eventPaymentChannels.js'

describe('normalizeEventPaymentChannelOverrides', () => {
  it('devuelve null cuando no hay nada que restringir', () => {
    expect(normalizeEventPaymentChannelOverrides(null)).toBeNull()
    expect(normalizeEventPaymentChannelOverrides({})).toBeNull()
    expect(normalizeEventPaymentChannelOverrides({ foo: true })).toBeNull()
    expect(normalizeEventPaymentChannelOverrides({ ticket: {} })).toBeNull()
    expect(normalizeEventPaymentChannelOverrides([])).toBeNull()
  })

  it('con claves de concepto ignora una bandera suelta al lado', () => {
    // Mezclar las dos formas no significa nada; adivinar sería peor que
    // descartar la mitad suelta.
    expect(
      normalizeEventPaymentChannelOverrides({
        ticket: { cash_pitbull: false },
        mercado_pago: false,
      }),
    ).toEqual({ ticket: { cash_pitbull: false } })
  })
})

describe('lectura por concepto', () => {
  const overrides = {
    registration: { cash_pitbull: true, wise_transfer: false },
    ticket: { cash_pitbull: false, wise_transfer: false },
  }

  it('un concepto sin entrada hereda la plataforma', () => {
    expect(eventChannelOverridesFor({ ticket: { cash_pitbull: false } }, 'registration')).toBeNull()
    expect(
      isEventChannelOpenForConcept({ ticket: { cash_pitbull: false } }, 'registration', 'cash_pitbull'),
    ).toBe(true)
  })

  it('responde distinto para inscripción y entradas', () => {
    expect(isEventChannelOpenForConcept(overrides, 'registration', 'cash_pitbull')).toBe(true)
    expect(isEventChannelOpenForConcept(overrides, 'ticket', 'cash_pitbull')).toBe(false)
  })

  it('"en algún lado" mira los dos conceptos', () => {
    expect(isEventChannelOpenAnywhere(overrides, 'cash_pitbull')).toBe(true)
    expect(isEventChannelOpenAnywhere(overrides, 'wise_transfer')).toBe(false)
    expect(isEventChannelOpenAnywhere(null, 'wise_transfer')).toBe(true)
  })

  it('lista los canales abiertos en orden canónico', () => {
    expect(openEventChannelsFor(overrides, 'ticket')).toEqual(['mercado_pago', 'bank_transfer'])
  })
})

describe('allOpenEventPaymentChannelOverrides', () => {
  it('arranca con todo abierto en los dos conceptos', () => {
    const all = allOpenEventPaymentChannelOverrides()
    expect(Object.keys(all)).toEqual(['registration', 'ticket'])
    expect(openEventChannelsFor(all, 'ticket')).toHaveLength(4)
    // Y no es una referencia compartida: tocar entradas no puede mover
    // inscripción.
    all.ticket.mercado_pago = false
    expect(all.registration.mercado_pago).toBe(true)
  })
})

describe("abrir y cerrar por evento ('open' / false)", () => {
  it("acepta 'open' y lo distingue del `true` heredado", () => {
    expect(
      normalizeEventPaymentChannelOverrides({ registration: { bank_transfer: 'open' } }),
    ).toEqual({ registration: { bank_transfer: 'open' } })
    expect(
      isEventChannelForcedOpen(
        { registration: { bank_transfer: 'open' } },
        'registration',
        'bank_transfer',
      ),
    ).toBe(true)
    expect(
      isEventChannelForcedOpen(
        { registration: { bank_transfer: true } },
        'registration',
        'bank_transfer',
      ),
    ).toBe(false)
    // Un valor cualquiera no es una decisión.
    expect(
      normalizeEventPaymentChannelOverrides({ registration: { bank_transfer: 'si' } }),
    ).toBeNull()
  })

  it('estado efectivo: el evento decide y, sin decisión, la plataforma', () => {
    const o = { registration: { bank_transfer: 'open', mercado_pago: false } }
    expect(resolveEventChannelState(o, 'registration', 'bank_transfer', false)).toBe(true)
    expect(resolveEventChannelState(o, 'registration', 'mercado_pago', true)).toBe(false)
    expect(resolveEventChannelState(o, 'registration', 'cash_pitbull', true)).toBe(true)
    expect(resolveEventChannelState(o, 'registration', 'cash_pitbull', false)).toBe(false)
    expect(resolveEventChannelState(null, 'ticket', 'wise_transfer', undefined)).toBe(false)
  })

  it('sólo se guarda lo que difiere de la plataforma', () => {
    expect(eventChannelFlagFor(true, true)).toBeNull()
    expect(eventChannelFlagFor(false, false)).toBeNull()
    expect(eventChannelFlagFor(false, true)).toBe(false)
    expect(eventChannelFlagFor(true, false)).toBe('open')
    expect(eventChannelFlagFor(true, undefined)).toBe('open')
  })

  it('poner y quitar celdas deja `null` cuando no queda ninguna decisión', () => {
    const one = setEventChannelFlag(null, 'ticket', 'cash_pitbull', false)
    expect(one).toEqual({ ticket: { cash_pitbull: false } })
    const two = setEventChannelFlag(one, 'registration', 'bank_transfer', 'open')
    expect(two).toEqual({
      ticket: { cash_pitbull: false },
      registration: { bank_transfer: 'open' },
    })
    expect(setEventChannelFlag(two, 'ticket', 'cash_pitbull', null)).toEqual({
      registration: { bank_transfer: 'open' },
    })
    expect(setEventChannelFlag(one, 'ticket', 'cash_pitbull', null)).toBeNull()
  })

  it('los canales efectivos suman lo que abre el evento y restan lo que cierra', () => {
    const platform = {
      mercado_pago: true,
      bank_transfer: false,
      cash_pitbull: false,
      wise_transfer: false,
    }
    expect(
      effectiveEventChannelsFor(
        { registration: { bank_transfer: 'open', mercado_pago: false } },
        'registration',
        platform,
      ),
    ).toEqual(['bank_transfer'])
  })

  it('aplicar las aperturas no muta los toggles ni toca otros conceptos', () => {
    const toggles = {
      paymentChannels: {
        membership: { bank_transfer: false },
        registration: { bank_transfer: false },
        ticket: { bank_transfer: false },
      },
    }
    const next = applyEventChannelOpens(toggles, { registration: { bank_transfer: 'open' } })
    expect(next.paymentChannels.registration.bank_transfer).toBe(true)
    expect(next.paymentChannels.ticket.bank_transfer).toBe(false)
    expect(next.paymentChannels.membership.bank_transfer).toBe(false)
    expect(toggles.paymentChannels.registration.bank_transfer).toBe(false)
    // Sin aperturas devuelve el mismo objeto, no una copia.
    expect(applyEventChannelOpens(toggles, { ticket: { cash_pitbull: false } })).toBe(toggles)
    expect(applyEventChannelOpens(toggles, null)).toBe(toggles)
  })
})
