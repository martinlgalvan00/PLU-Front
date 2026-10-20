import { describe, expect, it } from 'vitest'
import { HttpError } from '../server/lib/errors.js'
import { applyEventChannelOpens } from '../src/lib/eventPaymentChannels.js'
import { resolvePublicCheckoutAvailability } from '../server/services/platformFeatureToggleService.js'
import {
  applyEventPaymentChannelOverrides,
  applyManualTicketDeadline,
  assertEventBankTransferReady,
  bankTransferIssueError,
  checkEventBankTransferReady,
  checkEventMercadoPagoReady,
  assertEventPaymentChannelEnabled,
  assertManualTicketDeadline,
  isEventChannelOpen,
  normalizePaymentChannelOverrides,
  resolveBankTransferDetails,
  resolveEventMercadoPagoReadiness,
  normalizeCashPaymentInput,
  resolveCashPaymentDetails,
} from '../server/modules/payments/eventPaymentProfile.js'

describe('normalizePaymentChannelOverrides', () => {
  it('devuelve null cuando no hay override', () => {
    expect(normalizePaymentChannelOverrides(null)).toBeNull()
    expect(normalizePaymentChannelOverrides(undefined)).toBeNull()
    expect(normalizePaymentChannelOverrides({})).toBeNull()
    expect(normalizePaymentChannelOverrides({ foo: true })).toBeNull()
  })

  it('expande la forma plana vieja a los dos conceptos', () => {
    // Las filas que ya existen guardan un solo juego de banderas. Significaba
    // "lo mismo para inscripción y entradas", y tiene que seguir significando
    // eso: si no, cambiar el formato cambiaría el cobro de eventos vivos.
    expect(
      normalizePaymentChannelOverrides({
        mercado_pago: false,
        bank_transfer: true,
        junk: true,
      }),
    ).toEqual({
      registration: { mercado_pago: false, bank_transfer: true },
      ticket: { mercado_pago: false, bank_transfer: true },
    })
  })

  it('conserva la forma por concepto', () => {
    expect(
      normalizePaymentChannelOverrides({
        registration: { cash_pitbull: true },
        ticket: { cash_pitbull: false, junk: true },
      }),
    ).toEqual({
      registration: { cash_pitbull: true },
      ticket: { cash_pitbull: false },
    })
  })
})

describe('isEventChannelOpen', () => {
  it('hereda plataforma cuando no hay override', () => {
    expect(isEventChannelOpen(true, null, 'mercado_pago')).toBe(true)
    expect(isEventChannelOpen(false, null, 'mercado_pago')).toBe(false)
  })

  it('el evento solo puede cerrar', () => {
    expect(isEventChannelOpen(true, { mercado_pago: false }, 'mercado_pago')).toBe(false)
    expect(isEventChannelOpen(false, { mercado_pago: true }, 'mercado_pago')).toBe(false)
    expect(isEventChannelOpen(true, { mercado_pago: false }, 'bank_transfer')).toBe(true)
  })
})

describe('applyEventPaymentChannelOverrides', () => {
  const base = {
    membershipEnabled: true,
    registrationEnabled: true,
    ticketEnabled: true,
    membershipManualEnabled: true,
    registrationManualEnabled: true,
    ticketManualEnabled: true,
    paymentChannels: {
      membership: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: false,
      },
      registration: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: false,
        wise_transfer: false,
      },
      ticket: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: false,
        wise_transfer: false,
      },
    },
  }

  it('no toca membership y cierra registration/ticket según override', () => {
    const next = applyEventPaymentChannelOverrides(base, { mercado_pago: false })
    expect(next.paymentChannels.membership.mercado_pago).toBe(true)
    expect(next.paymentChannels.registration.mercado_pago).toBe(false)
    expect(next.paymentChannels.registration.bank_transfer).toBe(true)
    expect(next.paymentChannels.ticket.mercado_pago).toBe(false)
    expect(next.registrationManualEnabled).toBe(true)
  })

  it('sin override deja la availability intacta', () => {
    expect(applyEventPaymentChannelOverrides(base, null)).toBe(base)
  })

  it('cierra la venta de entradas si el evento cerró los cuatro medios', () => {
    const next = applyEventPaymentChannelOverrides(base, {
      ticket: {
        mercado_pago: false,
        bank_transfer: false,
        cash_pitbull: false,
        wise_transfer: false,
      },
    })
    // Sin esto la pantalla pública mostraba el formulario completo y el 409
    // llegaba recién al confirmar.
    expect(next.ticketEnabled).toBe(false)
    expect(next.ticketManualEnabled).toBe(false)
    // Inscripción no se arrastra: tiene cupones que saltean los canales manuales.
    expect(next.registrationEnabled).toBe(true)
  })

  it('cierra un canal solo en el concepto que lo pide', () => {
    const next = applyEventPaymentChannelOverrides(base, {
      ticket: { bank_transfer: false },
    })
    expect(next.paymentChannels.registration.bank_transfer).toBe(true)
    expect(next.paymentChannels.ticket.bank_transfer).toBe(false)
    expect(next.paymentChannels.ticket.mercado_pago).toBe(true)
    expect(next.registrationManualEnabled).toBe(true)
    // Entradas se queda sin ningún canal manual: la transferencia era el único
    // abierto en la plataforma para ese concepto.
    expect(next.ticketManualEnabled).toBe(false)
  })
})

describe('resolveBankTransferDetails', () => {
  it('prioriza el evento sobre el env', () => {
    expect(
      resolveBankTransferDetails(
        {
          bank_transfer_alias: 'evento.alias',
          bank_transfer_cbu: '123',
          bank_transfer_holder: 'Org Evento',
        },
        {
          VITE_PAYMENT_TRANSFER_ALIAS: 'global.alias',
          VITE_PAYMENT_TRANSFER_CBU: '999',
          VITE_PAYMENT_TRANSFER_HOLDER: 'Global',
        },
      ),
    ).toEqual({ alias: 'evento.alias', cbu: '123', holder: 'Org Evento' })
  })

  it('prioriza el perfil vinculado sobre el evento', () => {
    expect(
      resolveBankTransferDetails(
        {
          bank_transfer_alias: 'evento.alias',
          bank_transfer_cbu: '123',
          bank_transfer_holder: 'Org Evento',
        },
        { VITE_PAYMENT_TRANSFER_ALIAS: 'global.alias' },
        { config: { alias: 'perfil.alias', cbu: '555', holder: 'Club' } },
      ),
    ).toEqual({ alias: 'perfil.alias', cbu: '555', holder: 'Club' })
  })

  it('no mezcla el env si el evento ya tiene un dato propio', () => {
    expect(
      resolveBankTransferDetails(
        { bank_transfer_alias: 'evento.alias' },
        {
          VITE_PAYMENT_TRANSFER_ALIAS: 'global.alias',
          VITE_PAYMENT_TRANSFER_CBU: '999',
          VITE_PAYMENT_TRANSFER_HOLDER: 'Global',
        },
      ),
    ).toEqual({ alias: 'evento.alias', cbu: '', holder: '' })
  })

  it('no mezcla el env si el perfil vinculado está incompleto', () => {
    expect(
      resolveBankTransferDetails(
        { bank_transfer_cbu: '123', bank_transfer_holder: 'Org Evento' },
        { VITE_PAYMENT_TRANSFER_ALIAS: 'global.alias', VITE_PAYMENT_TRANSFER_CBU: '999' },
        { config: { alias: 'perfil.alias' } },
      ),
    ).toEqual({ alias: 'perfil.alias', cbu: '', holder: '' })
  })

  it('cae al env cuando el evento no define datos', () => {
    expect(
      resolveBankTransferDetails(null, {
        PAYMENT_TRANSFER_ALIAS: 'plu.alias',
        PAYMENT_TRANSFER_CBU: '111',
        PAYMENT_TRANSFER_HOLDER: 'PLU',
      }),
    ).toEqual({ alias: 'plu.alias', cbu: '111', holder: 'PLU' })
  })
})

describe('resolveCashPaymentDetails', () => {
  it('el lugar propio del evento manda', () => {
    expect(
      resolveCashPaymentDetails({
        venue: 'Virtus Fitness',
        location: 'Berazategui',
        cash_payment_place: ' Recepción del gimnasio ',
        cash_payment_notes: 'De 18 a 21.',
      }),
    ).toEqual({ place: 'Recepción del gimnasio', notes: 'De 18 a 21.' })
  })

  it('sin lugar propio se cobra en la sede del evento, nunca en un lugar fijo', () => {
    expect(
      resolveCashPaymentDetails({ venue: 'Virtus Fitness', location: 'Berazategui' }),
    ).toEqual({ place: 'Virtus Fitness · Berazategui', notes: null })
  })

  it('sin sede ni lugar devuelve null para que la pantalla use su texto genérico', () => {
    expect(resolveCashPaymentDetails(null)).toEqual({ place: null, notes: null })
  })

  it('normaliza y recorta lo que manda el panel', () => {
    expect(normalizeCashPaymentInput({ place: '  x  ', notes: 'n'.repeat(500) })).toEqual({
      place: 'x',
      notes: 'n'.repeat(400),
    })
    expect(normalizeCashPaymentInput(null)).toEqual({ place: '', notes: '' })
  })
})

describe('assertEventBankTransferReady', () => {
  it('no exige alias si hereda plataforma', () => {
    expect(() =>
      assertEventBankTransferReady({ overrides: null, bankTransfer: {}, env: {} }),
    ).not.toThrow()
  })

  it('exige alias cuando personaliza y deja transferencia abierta', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: { mercado_pago: false, bank_transfer: true },
        bankTransfer: { alias: '' },
        env: {},
      }),
    ).toThrowError(expect.objectContaining({ status: 400 }))
  })

  it('sigue exigiendo alias si la transferencia queda abierta en un solo concepto', () => {
    // El alias es uno solo para todo el evento: alcanza con que la
    // transferencia siga en pie para la inscripción.
    expect(() =>
      assertEventBankTransferReady({
        overrides: {
          registration: { bank_transfer: true },
          ticket: { bank_transfer: false },
        },
        bankTransfer: { alias: '' },
        env: {},
      }),
    ).toThrowError(expect.objectContaining({ status: 400 }))
  })

  it('no exige alias si la transferencia está cerrada en los dos', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: {
          registration: { bank_transfer: false },
          ticket: { bank_transfer: false },
        },
        bankTransfer: { alias: '' },
        env: {},
      }),
    ).not.toThrow()
  })

  it('acepta alias del env', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: { bank_transfer: true },
        bankTransfer: {},
        env: { VITE_PAYMENT_TRANSFER_ALIAS: 'plu.alias' },
      }),
    ).not.toThrow()
  })
})

describe('resolveEventMercadoPagoReadiness', () => {
  it('sin perfil usa la cuenta general de la plataforma', () => {
    expect(resolveEventMercadoPagoReadiness({})).toEqual({
      destination: 'platform',
      profileId: null,
      profileName: null,
      connectionStatus: null,
      active: null,
    })
  })

  it('marca missing si el perfil no existe o está archivado', () => {
    expect(
      resolveEventMercadoPagoReadiness({ mercadoPagoProfileId: 'mp-1', profile: null }),
    ).toMatchObject({ destination: 'missing', profileId: 'mp-1', active: false })
    expect(
      resolveEventMercadoPagoReadiness({
        mercadoPagoProfileId: 'mp-1',
        profile: { id: 'mp-1', name: 'Vieja', active: false },
      }),
    ).toMatchObject({ destination: 'missing', profileName: 'Vieja' })
  })

  it('expone connectionStatus de un perfil OAuth activo', () => {
    expect(
      resolveEventMercadoPagoReadiness({
        mercadoPagoProfileId: 'mp-1',
        profile: {
          id: 'mp-1',
          name: 'Club',
          active: true,
          connectionStatus: 'needs_reconnect',
          config: { connection: 'oauth', status: 'needs_reconnect' },
        },
      }),
    ).toEqual({
      destination: 'profile',
      profileId: 'mp-1',
      profileName: 'Club',
      connectionStatus: 'needs_reconnect',
      active: true,
    })
  })
})

describe('checkEventMercadoPagoReady', () => {
  it('no exige nada si hereda plataforma', () => {
    expect(checkEventMercadoPagoReady({ overrides: null })).toBeNull()
  })

  it('avisa si el override deja MP abierto con perfil faltante o a reconectar', () => {
    expect(
      checkEventMercadoPagoReady({
        overrides: { mercado_pago: true },
        mercadoPagoProfileId: 'mp-1',
        profile: null,
      }),
    ).toMatchObject({ code: 'EVENT_MERCADO_PAGO_PROFILE_MISSING' })

    expect(
      checkEventMercadoPagoReady({
        overrides: { mercado_pago: true },
        mercadoPagoProfileId: 'mp-1',
        profile: {
          id: 'mp-1',
          name: 'Club',
          active: true,
          connectionStatus: 'needs_reconnect',
        },
      }),
    ).toMatchObject({ code: 'EVENT_MERCADO_PAGO_NEEDS_RECONNECT' })
  })
})

describe('assertEventPaymentChannelEnabled', () => {
  const toggles = {
    paymentChannels: {
      membership: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      },
      registration: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      },
      ticket: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      },
    },
  }

  it('rechaza MP cuando el evento lo cerró', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'registration', 'mercado_pago', {
        eventOverrides: { mercado_pago: false },
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'REGISTRATION_MERCADO_PAGO_DISABLED' },
      }),
    )
  })

  it('deja pasar transferencia con MP cerrado en el evento', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'registration', 'bank_transfer', {
        eventOverrides: { mercado_pago: false },
      }),
    ).not.toThrow()
  })

  it('no aplica override a membership', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'membership', 'mercado_pago', {
        eventOverrides: { mercado_pago: false },
      }),
    ).not.toThrow()
  })

  it('cerrar efectivo en entradas no lo cierra en inscripción', () => {
    const eventOverrides = { ticket: { cash_pitbull: false } }

    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'registration', 'cash_pitbull', {
        eventOverrides,
      }),
    ).not.toThrow()

    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'ticket', 'cash_pitbull', { eventOverrides }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'TICKET_CASH_PITBULL_DISABLED' },
      }),
    )
  })

  it('avisa cuando el concepto se quedó sin ningún medio', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'ticket', 'mercado_pago', {
        eventOverrides: {
          ticket: {
            mercado_pago: false,
            bank_transfer: false,
            cash_pitbull: false,
            wise_transfer: false,
          },
        },
      }),
    ).toThrowError(
      expect.objectContaining({ status: 409, details: { code: 'TICKET_NO_PAYMENT_CHANNEL' } }),
    )
  })

  it('sigue respetando la plataforma cerrada', () => {
    const closed = {
      paymentChannels: {
        ...toggles.paymentChannels,
        registration: {
          mercado_pago: false,
          bank_transfer: true,
          cash_pitbull: false,
          wise_transfer: false,
        },
      },
    }
    expect(() =>
      assertEventPaymentChannelEnabled(closed, 'registration', 'mercado_pago', {
        eventOverrides: null,
      }),
    ).toThrow(HttpError)
  })
})

/**
 * La plataforma es el valor por defecto, no el techo: el evento abre con
 * `'open'` un canal que Finanzas tiene cerrado. Lo que sigue mandando es el
 * maestro y el alta del concepto, que se verifican antes de llegar acá.
 */
describe('el evento abre un canal que la plataforma tiene cerrado', () => {
  const platform = {
    paymentChannels: {
      membership: {
        mercado_pago: true,
        bank_transfer: false,
        cash_pitbull: false,
        wise_transfer: false,
      },
      registration: {
        mercado_pago: true,
        bank_transfer: false,
        cash_pitbull: false,
        wise_transfer: false,
      },
      ticket: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: false,
        wise_transfer: false,
      },
    },
  }

  it('sin decisión del evento, la plataforma cerrada rechaza', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(platform, 'registration', 'bank_transfer', {
        eventOverrides: null,
      }),
    ).toThrow(HttpError)
  })

  it("'open' habilita la transferencia solo en inscripción", () => {
    const eventOverrides = { registration: { bank_transfer: 'open' } }
    expect(() =>
      assertEventPaymentChannelEnabled(platform, 'registration', 'bank_transfer', {
        eventOverrides,
      }),
    ).not.toThrow()
    // El efectivo sigue cerrado.
    expect(() =>
      assertEventPaymentChannelEnabled(platform, 'registration', 'cash_pitbull', {
        eventOverrides,
      }),
    ).toThrow(HttpError)
  })

  it('un `true` heredado sigue siendo "sin opinión": no reabre nada', () => {
    // El panel anterior guardaba los cuatro en `true`. Leerlo como "abrir"
    // reabriría canales que Finanzas cerró en eventos que ya existen.
    expect(() =>
      assertEventPaymentChannelEnabled(platform, 'registration', 'bank_transfer', {
        eventOverrides: { registration: { bank_transfer: true, cash_pitbull: true } },
      }),
    ).toThrow(HttpError)
  })

  it('un cierre del evento gana sobre una apertura de la plataforma', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(platform, 'ticket', 'bank_transfer', {
        eventOverrides: { ticket: { bank_transfer: false } },
      }),
    ).toThrow(HttpError)
  })

  it('no reabre una venta que la plataforma pausó entera', () => {
    const availability = resolvePublicCheckoutAvailability(
      applyEventChannelOpens(
        { ...platform, registrationEnabled: false },
        { registration: { bank_transfer: 'open' } },
      ),
    )
    expect(availability.registrationEnabled).toBe(false)
    expect(availability.paymentChannels.registration.bank_transfer).toBe(false)
  })

  it('la disponibilidad pública ofrece el canal que el evento abrió', () => {
    const overrides = { registration: { bank_transfer: 'open', cash_pitbull: 'open' } }
    const availability = applyEventPaymentChannelOverrides(
      resolvePublicCheckoutAvailability(applyEventChannelOpens(platform, overrides)),
      overrides,
    )
    expect(availability.paymentChannels.registration.bank_transfer).toBe(true)
    expect(availability.paymentChannels.registration.cash_pitbull).toBe(true)
    expect(availability.registrationManualEnabled).toBe(true)
    // Entradas no se tocó: queda como lo dejó la plataforma.
    expect(availability.paymentChannels.ticket.cash_pitbull).toBe(false)
    expect(availability.paymentChannels.ticket.bank_transfer).toBe(true)
  })

  it('una apertura y un cierre conviven en el mismo evento', () => {
    const overrides = { registration: { bank_transfer: 'open', mercado_pago: false } }
    const availability = applyEventPaymentChannelOverrides(
      resolvePublicCheckoutAvailability(applyEventChannelOpens(platform, overrides)),
      overrides,
    )
    expect(availability.paymentChannels.registration.bank_transfer).toBe(true)
    expect(availability.paymentChannels.registration.mercado_pago).toBe(false)
  })

  it('exige alias cuando el evento abre la transferencia', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: { registration: { bank_transfer: 'open' } },
        bankTransfer: { alias: '', cbu: '', holder: '' },
        env: {},
      }),
    ).toThrow(HttpError)
  })
})

/**
 * Los canales manuales contra el calendario. Una transferencia necesita hasta
 * 72 horas para convertirse en un QR (24 del comprobante + 48 de aprobación):
 * vendida después de ese punto, la entrada no llega y lo que queda es una
 * devolución.
 */
describe('plazo de los canales manuales de entradas', () => {
  const STARTS = '2026-12-12T12:00:00.000Z'
  const LEJOS = new Date('2026-12-01T00:00:00.000Z')
  const CERCA = new Date('2026-12-11T00:00:00.000Z')

  const availability = {
    ticketEnabled: true,
    ticketManualEnabled: true,
    paymentChannels: {
      ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true },
    },
  }

  it('lejos del evento no toca nada', () => {
    expect(applyManualTicketDeadline(availability, STARTS, LEJOS)).toBe(availability)
  })

  it('sobre la fecha cierra transferencia y Wise; Mercado Pago y efectivo siguen', () => {
    const next = applyManualTicketDeadline(availability, STARTS, CERCA)
    expect(next.paymentChannels.ticket.bank_transfer).toBe(false)
    expect(next.paymentChannels.ticket.wise_transfer).toBe(false)
    expect(next.paymentChannels.ticket.mercado_pago).toBe(true)
    // Se paga en la sede y se acredita en el momento: no hay demora que cubrir.
    expect(next.paymentChannels.ticket.cash_pitbull).toBe(true)
    expect(next.ticketManualEnabled).toBe(true)
    expect(next.ticketEnabled).toBe(true)
  })

  it('sin efectivo abierto, sobre la fecha no queda ningún medio manual', () => {
    const sinEfectivo = {
      ...availability,
      paymentChannels: { ticket: { ...availability.paymentChannels.ticket, cash_pitbull: false } },
    }
    expect(applyManualTicketDeadline(sinEfectivo, STARTS, CERCA).ticketManualEnabled).toBe(false)
  })

  it('si Mercado Pago y el efectivo ya estaban cerrados, cierra la venta entera', () => {
    const soloComprobante = {
      ...availability,
      paymentChannels: {
        ticket: { ...availability.paymentChannels.ticket, mercado_pago: false, cash_pitbull: false },
      },
    }
    expect(applyManualTicketDeadline(soloComprobante, STARTS, CERCA).ticketEnabled).toBe(false)
  })

  it('con solo efectivo abierto la venta sigue hasta el cierre', () => {
    const soloEfectivo = {
      ...availability,
      paymentChannels: {
        ticket: { mercado_pago: false, bank_transfer: true, cash_pitbull: true, wise_transfer: false },
      },
    }
    const next = applyManualTicketDeadline(soloEfectivo, STARTS, CERCA)
    expect(next.ticketEnabled).toBe(true)
    expect(next.paymentChannels.ticket.cash_pitbull).toBe(true)
  })

  it('un evento sin fecha no pierde la venta por una regla de calendario', () => {
    expect(applyManualTicketDeadline(availability, null, CERCA)).toBe(availability)
    expect(() => assertManualTicketDeadline('bank_transfer', null, CERCA)).not.toThrow()
  })

  it('la orden rebota con el motivo y la fecha de corte', () => {
    expect(() => assertManualTicketDeadline('bank_transfer', STARTS, CERCA)).toThrowError(
      expect.objectContaining({
        status: 409,
        details: expect.objectContaining({ code: 'TICKET_MANUAL_DEADLINE_PASSED' }),
      }),
    )
  })

  it('Mercado Pago y el efectivo pasan aunque falten horas; Wise no', () => {
    expect(() => assertManualTicketDeadline('mercado_pago', STARTS, CERCA)).not.toThrow()
    expect(() => assertManualTicketDeadline('cash_pitbull', STARTS, CERCA)).not.toThrow()
    expect(() => assertManualTicketDeadline('wise_transfer', STARTS, CERCA)).toThrow(HttpError)
  })
})

describe('checkEventBankTransferReady', () => {
  const open = { registration: { bank_transfer: 'open' } }

  it('devuelve el problema con el campo a completar, sin lanzar', () => {
    const issue = checkEventBankTransferReady({ overrides: open, bankTransfer: {}, env: {} })
    expect(issue).toMatchObject({
      code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED',
      field: 'bankTransferProfileId',
    })
    expect(issue.message).toMatch(/Ventas → Cobro/)
  })

  it('no hay problema con alias propio, con alias global o sin transferencia', () => {
    expect(
      checkEventBankTransferReady({ overrides: open, bankTransfer: { alias: 'club.pesas' }, env: {} }),
    ).toBeNull()
    expect(
      checkEventBankTransferReady({ overrides: open, bankTransfer: {}, env: { PAYMENT_TRANSFER_ALIAS: 'g.a' } }),
    ).toBeNull()
    expect(
      checkEventBankTransferReady({
        overrides: { registration: { bank_transfer: false }, ticket: { bank_transfer: false } },
        bankTransfer: {},
        env: {},
      }),
    ).toBeNull()
  })

  it('el error que arma lleva el campo en `fields` para que el panel salte ahí', () => {
    const issue = checkEventBankTransferReady({ overrides: open, bankTransfer: {}, env: {} })
    const error = bankTransferIssueError(issue)
    expect(error.status).toBe(400)
    expect(error.details.fields).toEqual({ bankTransferProfileId: issue.message })
  })
})

describe('checkEventBankTransferReady', () => {
  const open = { registration: { bank_transfer: 'open' } }

  it('devuelve el problema con el campo a completar, sin lanzar', () => {
    const issue = checkEventBankTransferReady({ overrides: open, bankTransfer: {}, env: {} })
    expect(issue).toMatchObject({
      code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED',
      field: 'bankTransferProfileId',
    })
    expect(issue.message).toMatch(/Ventas → Cobro/)
  })

  it('no hay problema con alias propio, con alias global o sin transferencia', () => {
    expect(
      checkEventBankTransferReady({ overrides: open, bankTransfer: { alias: 'club.pesas' }, env: {} }),
    ).toBeNull()
    expect(
      checkEventBankTransferReady({ overrides: open, bankTransfer: {}, env: { PAYMENT_TRANSFER_ALIAS: 'g.a' } }),
    ).toBeNull()
    expect(
      checkEventBankTransferReady({
        overrides: { registration: { bank_transfer: false }, ticket: { bank_transfer: false } },
        bankTransfer: {},
        env: {},
      }),
    ).toBeNull()
  })

  it('el error que arma lleva el campo en `fields` para que el panel salte ahí', () => {
    const issue = checkEventBankTransferReady({ overrides: open, bankTransfer: {}, env: {} })
    const error = bankTransferIssueError(issue)
    expect(error.status).toBe(400)
    expect(error.details.fields).toEqual({ bankTransferProfileId: issue.message })
  })
})
