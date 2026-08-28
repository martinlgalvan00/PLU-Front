import { describe, expect, it } from 'vitest'
import {
  resolveComboDeal,
  resolveEventPricing,
  resolveLiveComboOffer,
  resolveUpcomingPriceChange,
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
