import { describe, expect, it } from 'vitest'
import {
  resolveComboDeal,
  resolveEventPricing,
  resolveLiveComboOffer,
  resolveUpcomingPriceChange,
  ticketPricingFromEvent,
} from '../src/lib/eventPricing.js'

describe('resolveComboDeal', () => {
  it('calcula ahorro y 20% sobre 75k + 75k a 120k', () => {
    expect(
      resolveComboDeal({
        membership: 75000,
        registration: 75000,
        combo: 120000,
      }),
    ).toEqual({
      membership: 75000,
      registration: 75000,
      combo: 120000,
      separate: 150000,
      savings: 30000,
      percent: 20,
      live: true,
    })
  })

  it('no marca live si el combo no descuenta', () => {
    expect(
      resolveComboDeal({
        membership: 75000,
        registration: 75000,
        combo: 150000,
      }).live,
    ).toBe(false)
  })

  it('ignora montos inválidos', () => {
    expect(resolveComboDeal({ membership: 0, registration: 75000, combo: 120000 }).live).toBe(false)
  })
})

describe('resolveLiveComboOffer', () => {
  it('no publica combos apagados ni restringidos', () => {
    expect(resolveLiveComboOffer({ comboOffer: { active: false, price: 120000 } })).toBeNull()
    expect(
      resolveLiveComboOffer({
        comboOffer: { active: true, audience: 'code', price: 120000 },
      }),
    ).toBeNull()
  })

  it('permite resolver el combo restringido solo en un contexto desbloqueado', () => {
    const offer = { active: true, audience: 'code', price: 120000 }
    expect(
      resolveLiveComboOffer({ comboOffer: offer }, new Date(), { includeRestricted: true }),
    ).toBe(offer)
  })

  it('nunca resuelve un combo privado, ni desde un contexto desbloqueado', () => {
    const offer = { active: true, audience: 'private', price: 120000 }
    expect(
      resolveLiveComboOffer({ comboOffer: offer }, new Date(), { includeRestricted: true }),
    ).toBeNull()
  })

  it('no publica un combo archivado aunque siga con active=true (20260914100000)', () => {
    // El fallback de `fetchPublishedEvents` a Supabase directo no pasa por
    // `sanitizePublicCatalogEvent`: sin este chequeo, un combo archivado con
    // su precio congelado volvía a anunciarse a cualquier visitante.
    const offer = { active: true, audience: 'public', price: 120000, archivedAt: '2026-09-14T10:00:00Z' }
    expect(resolveLiveComboOffer({ comboOffer: offer })).toBeNull()
  })
})

describe('resolveUpcomingPriceChange (20260929100000)', () => {
  const now = new Date('2026-09-15T12:00:00Z')

  it('null sin cambio programado o con datos incompletos', () => {
    expect(resolveUpcomingPriceChange({}, now)).toBeNull()
    expect(resolveUpcomingPriceChange({ scheduledPrice: 90000 }, now)).toBeNull()
    expect(
      resolveUpcomingPriceChange({ priceEffectiveAt: '2026-10-01T03:00:00Z' }, now),
    ).toBeNull()
  })

  it('describe el aumento pendiente con su fecha', () => {
    const change = resolveUpcomingPriceChange(
      {
        scheduledPrice: 90000,
        scheduledManualPrice: 85000,
        priceEffectiveAt: '2026-10-01T03:00:00Z',
      },
      now,
    )
    expect(change).toEqual({
      price: 90000,
      manualPrice: 85000,
      effectiveAt: '2026-10-01T03:00:00Z',
      live: false,
    })
  })

  it('marca live cuando la fecha llegó pero el barrido del cron todavía no corrió', () => {
    const change = resolveUpcomingPriceChange(
      { scheduledPrice: 90000, priceEffectiveAt: '2026-09-15T11:59:00Z' },
      now,
    )
    expect(change.live).toBe(true)
    expect(change.manualPrice).toBeNull()
  })
})

describe('resolveEventPricing con cambio de precio programado', () => {
  const now = new Date('2026-09-15T12:00:00Z')
  const baseEvent = { price: 80000, manualPrice: 78000 }

  it('anuncia el aumento futuro sin tocar el precio vigente', () => {
    const pricing = resolveEventPricing(
      {
        ...baseEvent,
        scheduledPrice: 90000,
        scheduledManualPrice: 85000,
        priceEffectiveAt: '2026-10-01T03:00:00Z',
      },
      now,
    )
    expect(pricing.registration).toBe(80000)
    expect(pricing.registrationManual).toBe(78000)
    expect(pricing.upcoming).toEqual({
      price: 90000,
      manualPrice: 85000,
      effectiveAt: '2026-10-01T03:00:00Z',
      live: false,
    })
  })

  it('en el minuto de gracia muestra el precio nuevo y retira el anuncio', () => {
    // El cron vuelca el precio cada minuto: entre la fecha y esa corrida el
    // frontend no puede anunciar un importe que el checkout ya no va a cobrar.
    const pricing = resolveEventPricing(
      {
        ...baseEvent,
        scheduledPrice: 90000,
        scheduledManualPrice: 85000,
        priceEffectiveAt: '2026-09-15T11:59:00Z',
      },
      now,
    )
    expect(pricing.registration).toBe(90000)
    expect(pricing.registrationManual).toBe(85000)
    expect(pricing.upcoming).toBeNull()
  })

  it('sin programación no agrega anuncio', () => {
    expect(resolveEventPricing(baseEvent, now).upcoming).toBeNull()
  })
})

describe('ticketPricingFromEvent — subcategorías de entrada', () => {
  const event = {
    ticketTypes: [
      {
        id: 'tt-espectador',
        name: 'Espectador',
        price: 20000,
        sortOrder: 0,
        credentials: [{ label: 'Entrada general', zoneScopes: ['gate_tickets'] }],
      },
      {
        id: 'tt-entrenador',
        name: 'Entrenador',
        price: 35000,
        sortOrder: 1,
        credentials: [
          { label: 'Espectador', zoneScopes: ['gate_tickets'] },
          { label: 'ENTRENADOR', zoneScopes: ['athletes_coaches'] },
        ],
      },
    ],
  }

  /**
   * Este map descartaba `credentials`: la base distinguía los tipos y el
   * comprador veía dos nombres sueltos.
   */
  it('lleva las zonas de cada tipo hasta el comprador', () => {
    const [espectador, entrenador] = ticketPricingFromEvent(event).ticketTypes
    expect(espectador.zoneScopes).toEqual(['gate_tickets'])
    expect(entrenador.zoneScopes).toEqual(['gate_tickets', 'athletes_coaches'])
  })

  it('dice cuántas credenciales emite cada compra', () => {
    const [espectador, entrenador] = ticketPricingFromEvent(event).ticketTypes
    expect(espectador.credentialCount).toBe(1)
    expect(entrenador.credentialCount).toBe(2)
  })

  /** Un tipo cargado por una versión anterior del panel no puede romper la venta. */
  it('un tipo sin credenciales se comporta como una entrada común', () => {
    const [type] = ticketPricingFromEvent({
      ticketTypes: [{ id: 'tt-1', name: 'General', price: 1000 }],
    }).ticketTypes
    expect(type.zoneScopes).toEqual(['gate_tickets'])
    expect(type.credentialCount).toBe(1)
  })
})

/**
 * Ventana propia del tipo y precio propio en USD. El filtro vive en
 * `ticketPricingFromEvent` y no en la pantalla a propósito: `ticketService`
 * cotiza sobre el mismo catálogo que se muestra, así que un tipo que no se
 * ofrece tampoco puede entrar en un total.
 */
describe('ticketPricingFromEvent — ventana propia y precio Wise por tipo', () => {
  const NOW = new Date('2026-03-10T12:00:00')

  function eventWith(ticketTypes) {
    return { pricing: { ticketsEnabled: true, ticketAddons: [] }, eventDays: [], ticketTypes }
  }

  it('deja fuera el tipo que todavía no abrió y el que ya cerró', () => {
    const pricing = ticketPricingFromEvent(
      eventWith([
        { id: 'preventa', name: 'Preventa', price: 15000, salesClosesAt: '2026-03-01T23:59' },
        { id: 'general', name: 'General', price: 20000 },
        { id: 'puerta', name: 'En puerta', price: 25000, salesOpensAt: '2026-04-01T10:00' },
      ]),
      NOW,
    )
    expect(pricing.ticketTypes.map((type) => type.id)).toEqual(['general'])
  })

  it('una ventana vigente no saca nada del catálogo', () => {
    const pricing = ticketPricingFromEvent(
      eventWith([
        {
          id: 'general',
          name: 'General',
          price: 20000,
          salesOpensAt: '2026-03-01T00:00',
          salesClosesAt: '2026-03-20T23:59',
        },
      ]),
      NOW,
    )
    expect(pricing.ticketTypes).toHaveLength(1)
  })

  it('el precio en USD viaja al checkout; sin cargar queda en null y se convierte', () => {
    const pricing = ticketPricingFromEvent(
      eventWith([
        { id: 'general', name: 'General', price: 20000, wisePrice: 15 },
        { id: 'coach', name: 'Entrenador', price: 40000 },
      ]),
      NOW,
    )
    expect(pricing.ticketTypes.map((type) => type.wisePrice)).toEqual([15, null])
  })

  it('el precio manual (transferencia/efectivo) viaja al checkout; sin cargar queda en null', () => {
    const pricing = ticketPricingFromEvent(
      eventWith([
        { id: 'general', name: 'General', price: 20000, manualPrice: 17000 },
        { id: 'coach', name: 'Entrenador', price: 40000 },
      ]),
      NOW,
    )
    expect(pricing.ticketTypes.map((type) => type.manualPrice)).toEqual([17000, null])
  })

  it('un manualPrice inválido (0, negativo, no numérico) también queda en null', () => {
    const pricing = ticketPricingFromEvent(
      eventWith([
        { id: 'a', name: 'A', price: 20000, manualPrice: 0 },
        { id: 'b', name: 'B', price: 20000, manualPrice: -5 },
        { id: 'c', name: 'C', price: 20000, manualPrice: 'no-numero' },
      ]),
      NOW,
    )
    expect(pricing.ticketTypes.map((type) => type.manualPrice)).toEqual([null, null, null])
  })
})
