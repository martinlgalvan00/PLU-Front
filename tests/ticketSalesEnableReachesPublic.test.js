import { describe, expect, it } from 'vitest'
import { resolvePublicCheckoutAvailability } from '../server/services/platformFeatureToggleService.js'
import {
  applyEventPaymentChannelOverrides,
  applyManualTicketDeadline,
} from '../server/modules/payments/eventPaymentProfile.js'

/**
 * "Si le doy a habilitar, ¿se habilita al público?"
 *
 * La venta de entradas pasa por varios cortes que viven en lugares distintos.
 * Esta suite recorre la cadena real del payload público —plataforma, override
 * del evento y plazo de los canales manuales— en el mismo orden en que la
 * arma `GET /tickets/availability/:slug`, y fija dos cosas:
 *
 *   1. Con el interruptor prendido y nada más configurado, la venta llega
 *      abierta. Ningún default cierra por su cuenta.
 *   2. Cada corte cierra solo cuando corresponde, y se puede nombrar cuál fue.
 *
 * Lo que NO cubre: los cortes del lado del evento (ventana de venta, estado,
 * tipos activos, jornadas). Esos los resuelve `resolveTicketSalesState`, que es
 * lo que el panel muestra en el editor.
 */

const INICIO_EVENTO = '2026-12-12T12:00:00.000Z'
const DOS_SEMANAS_ANTES = new Date('2026-11-28T00:00:00.000Z')
const TREINTA_SEIS_HORAS_ANTES = new Date('2026-12-11T00:00:00.000Z')

const TODOS_CERRADOS = {
  mercado_pago: false,
  bank_transfer: false,
  cash_pitbull: false,
  wise_transfer: false,
}

/** La misma composición que arma la ruta pública de disponibilidad. */
function ventaPublica({
  toggles = {},
  env = {},
  overrides = null,
  startsAt = INICIO_EVENTO,
  now = DOS_SEMANAS_ANTES,
} = {}) {
  return applyManualTicketDeadline(
    applyEventPaymentChannelOverrides(resolvePublicCheckoutAvailability(toggles, env), overrides),
    startsAt,
    now,
  )
}

describe('habilitar la venta de entradas llega al público', () => {
  it('con el interruptor prendido y nada más configurado, la venta está abierta', () => {
    // Sin variables de entorno, sin matriz cargada y sin override del evento:
    // es el estado de una organización que recién prende la venta.
    const venta = ventaPublica()

    expect(venta.ticketEnabled).toBe(true)
    expect(venta.paymentChannels.ticket.mercado_pago).toBe(true)
  })

  it('los dos cortes nuevos no cierran nada por sí solos', () => {
    // Guardia explícita: ni "sin canales" ni el plazo manual pueden cerrar un
    // evento normal. Si alguno de los dos se vuelve más agresivo, esto rompe.
    const sinOverride = ventaPublica({ overrides: null })
    const conOverrideVacio = ventaPublica({ overrides: { ticket: { wise_transfer: false } } })

    expect(sinOverride.ticketEnabled).toBe(true)
    expect(conOverrideVacio.ticketEnabled).toBe(true)
    expect(conOverrideVacio.paymentChannels.ticket.mercado_pago).toBe(true)
  })

  it('sobre la fecha se cae la transferencia, pero la venta sigue abierta', () => {
    // El corte de 72 horas no cierra la venta: mueve al comprador a Mercado
    // Pago, que es el único medio que llega a tiempo.
    const venta = ventaPublica({ now: TREINTA_SEIS_HORAS_ANTES })

    expect(venta.ticketEnabled).toBe(true)
    expect(venta.paymentChannels.ticket.mercado_pago).toBe(true)
    expect(venta.paymentChannels.ticket.bank_transfer).toBe(false)
    expect(venta.ticketManualEnabled).toBe(false)
  })

  it('un evento sin fecha cargada no pierde la venta', () => {
    expect(ventaPublica({ startsAt: null, now: TREINTA_SEIS_HORAS_ANTES }).ticketEnabled).toBe(true)
  })
})

describe('cada corte cierra por su cuenta y se puede nombrar', () => {
  it('el freno de entorno', () => {
    expect(ventaPublica({ env: { TICKET_SALES_ENABLED: 'false' } }).ticketEnabled).toBe(false)
  })

  it('el interruptor maestro de cobros', () => {
    expect(ventaPublica({ toggles: { checkoutEnabled: false } }).ticketEnabled).toBe(false)
  })

  it('el interruptor de entradas de la plataforma', () => {
    expect(ventaPublica({ toggles: { ticketEnabled: false } }).ticketEnabled).toBe(false)
  })

  it('la matriz de plataforma sin ningún medio abierto', () => {
    expect(
      ventaPublica({ toggles: { paymentChannels: { ticket: TODOS_CERRADOS } } }).ticketEnabled,
    ).toBe(false)
  })

  it('el evento que cerró sus cuatro medios', () => {
    expect(ventaPublica({ overrides: { ticket: TODOS_CERRADOS } }).ticketEnabled).toBe(false)
  })

  it('el plazo manual, solo si Mercado Pago ya estaba cerrado', () => {
    const soloTransferencia = { ticket: { mercado_pago: false } }

    expect(ventaPublica({ overrides: soloTransferencia }).ticketEnabled).toBe(true)
    expect(
      ventaPublica({ overrides: soloTransferencia, now: TREINTA_SEIS_HORAS_ANTES }).ticketEnabled,
    ).toBe(false)
  })

  it('cerrar entradas no arrastra inscripción ni afiliación', () => {
    const venta = ventaPublica({ overrides: { ticket: TODOS_CERRADOS } })

    expect(venta.ticketEnabled).toBe(false)
    expect(venta.registrationEnabled).toBe(true)
    expect(venta.membershipEnabled).toBe(true)
  })
})
