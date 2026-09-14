import { describe, expect, it } from 'vitest'
import {
  allOpenEventPaymentChannelOverrides,
  eventChannelOverridesFor,
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
