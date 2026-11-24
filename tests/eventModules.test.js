import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EVENT_MODULE_KEYS,
  eventAcceptsInstallments,
  eventModulesForStorage,
  eventModulesFromRules,
  isStoredEventModuleOn,
  maxInstallmentsFor,
  normalizeEventModules,
  normalizeEventPaymentPolicy,
  paymentPolicyForStorage,
  resolveEventModules,
} from '../shared/eventModules.js'
import { ticketPricingFromEvent } from '../src/lib/eventPricing.js'
import { sanitizePublicCatalogEvent } from '../server/services/publicEventCatalogService.js'

describe('módulos guardados', () => {
  it('sin dato todo está prendido: los eventos existentes no cambian', () => {
    for (const raw of [undefined, null, {}, 'x', []]) {
      expect(normalizeEventModules(raw)).toEqual({ combo: true, ticketAddons: true, door: true })
    }
  })

  it('solo `false` apaga; cualquier otro valor es "sin opinión"', () => {
    expect(normalizeEventModules({ combo: false, door: 'no', ticketAddons: 0 })).toEqual({
      combo: false,
      ticketAddons: true,
      door: true,
    })
  })

  it('persiste solo lo apagado', () => {
    expect(eventModulesForStorage({ combo: false, ticketAddons: true, door: false })).toEqual({
      combo: false,
      door: false,
    })
    expect(eventModulesForStorage(null)).toEqual({})
  })

  it('lee el evento mapeado o la fila cruda', () => {
    expect(isStoredEventModuleOn({ modules: { combo: false } }, 'combo')).toBe(false)
    expect(isStoredEventModuleOn({ rules: { modules: { combo: false } } }, 'combo')).toBe(false)
    expect(isStoredEventModuleOn({ rules: {} }, 'combo')).toBe(true)
    expect(eventModulesFromRules({ modules: { door: false } }).door).toBe(false)
    // Los que tienen campo propio no se leen de `rules.modules`.
    expect(isStoredEventModuleOn({ modules: { registration: false } }, 'registration')).toBe(true)
  })
})

describe('tope de cuotas', () => {
  it('sin tope decide Mercado Pago', () => {
    expect(normalizeEventPaymentPolicy(null)).toEqual({
      registration: { maxInstallments: null },
      ticket: { maxInstallments: null },
    })
    expect(maxInstallmentsFor({}, 'registration')).toBeNull()
    expect(eventAcceptsInstallments({}, 'ticket', 12)).toBe(true)
  })

  it('descarta topes fuera de rango o no enteros', () => {
    const policy = normalizeEventPaymentPolicy({
      registration: { maxInstallments: 0 },
      ticket: { maxInstallments: 2.5 },
    })
    expect(policy.registration.maxInstallments).toBeNull()
    expect(policy.ticket.maxInstallments).toBeNull()
    expect(
      normalizeEventPaymentPolicy({ ticket: { maxInstallments: 25 } }).ticket.maxInstallments,
    ).toBeNull()
  })

  it('aplica el tope por concepto, desde el evento mapeado o la fila', () => {
    const event = { paymentPolicy: { registration: { maxInstallments: 3 } } }
    expect(maxInstallmentsFor(event, 'registration')).toBe(3)
    expect(maxInstallmentsFor(event, 'ticket')).toBeNull()
    expect(eventAcceptsInstallments(event, 'registration', 3)).toBe(true)
    expect(eventAcceptsInstallments(event, 'registration', 6)).toBe(false)
    expect(
      maxInstallmentsFor(
        { rules: { paymentPolicy: { ticket: { maxInstallments: 1 } } } },
        'ticket',
      ),
    ).toBe(1)
  })

  it('persiste solo los conceptos con tope', () => {
    expect(
      paymentPolicyForStorage({
        registration: { maxInstallments: 6 },
        ticket: { maxInstallments: null },
      }),
    ).toEqual({ registration: { maxInstallments: 6 } })
    expect(paymentPolicyForStorage(undefined)).toEqual({})
  })
})

describe('resolveEventModules', () => {
  const byKey = (event) => Object.fromEntries(resolveEventModules(event).map((m) => [m.key, m]))

  it('lee cada módulo de su campo: no hay un segundo interruptor para lo mismo', () => {
    const modules = byKey({
      salesIntent: 'announce',
      pricing: { ticketsEnabled: true },
      publicSurface: { schedule: false },
      modules: { door: false },
    })
    expect(Object.keys(modules)).toEqual([...EVENT_MODULE_KEYS])
    expect(modules.registration.on).toBe(false)
    expect(modules.tickets.on).toBe(true)
    expect(modules.schedule.on).toBe(false)
    expect(modules.door.on).toBe(false)
    expect(modules.combo.on).toBe(true)
  })

  it('un módulo prendido sin su dependencia no tiene efecto, y dice por qué', () => {
    const modules = byKey({ salesIntent: 'announce', pricing: { ticketsEnabled: false } })
    expect(modules.combo).toMatchObject({ on: true, active: false, blockedBy: 'registration' })
    expect(modules.ticketAddons).toMatchObject({ on: true, active: false, blockedBy: 'tickets' })
  })

  it('con la dependencia prendida, el módulo está activo', () => {
    const modules = byKey({ salesIntent: 'charge', pricing: { ticketsEnabled: true } })
    expect(modules.combo).toMatchObject({ on: true, active: true, blockedBy: null })
    expect(modules.ticketAddons).toMatchObject({ on: true, active: true, blockedBy: null })
  })
})

describe('el sitio respeta los módulos', () => {
  const combo = {
    active: true,
    audience: 'public',
    price: 100000,
    starts_at: null,
    ends_at: null,
    archived_at: null,
  }

  it('el catálogo no publica el combo con el módulo apagado', () => {
    const on = sanitizePublicCatalogEvent({ rules: { comboPrice: 1 }, comboOffer: combo })
    expect(on.comboOffer).not.toBeNull()
    const off = sanitizePublicCatalogEvent({
      rules: { comboPrice: 1, modules: { combo: false } },
      comboOffer: combo,
    })
    expect(off.comboOffer).toBeNull()
    expect(off.rules.comboPrice).toBeUndefined()
  })

  it('sin extras se venden solo los que un tipo trae incluidos', () => {
    const event = {
      pricing: {
        ticketsEnabled: true,
        ticketAddons: [
          { id: 'remera', label: 'Remera', price: 1000, enabled: true, sortOrder: 0 },
          { id: 'cena', label: 'Cena', price: 2000, enabled: true, sortOrder: 1 },
        ],
      },
      ticketTypes: [
        { id: 'vip', name: 'VIP', price: 5000, active: true, includedAddonIds: ['remera'] },
      ],
    }
    expect(ticketPricingFromEvent(event).addons.map((addon) => addon.id)).toEqual([
      'remera',
      'cena',
    ])
    const off = ticketPricingFromEvent({ ...event, modules: { ticketAddons: false } })
    expect(off.addons.map((addon) => addon.id)).toEqual(['remera'])
    expect(off.ticketTypes[0].includedAddons.map((addon) => addon.id)).toEqual(['remera'])
  })
})

describe('migración 20270103100000', () => {
  const sql = readFileSync(
    'supabase/migrations/20270103100000_event_modules_payment_policy.sql',
    'utf8',
  )

  it('solo acepta los módulos guardados y apagados', () => {
    expect(sql).toMatch(/v_key not in \('combo', 'ticketAddons', 'door'\)/)
    expect(sql).toMatch(/<> 'false'::jsonb/)
  })

  it('acota el tope de cuotas al mismo rango que la ruta de pagos', () => {
    expect(sql).toMatch(/v_key not in \('registration', 'ticket'\)/)
    expect(sql).toMatch(/not between 1 and 24/)
  })

  it('solo la ejecuta el service role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.staff_merge_event_modules\(text, jsonb, jsonb\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.staff_merge_event_modules\(text, jsonb, jsonb\)\s+to service_role/,
    )
  })
})
