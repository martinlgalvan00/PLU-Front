import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

const athleteHeaders = {
  ...mutationHeaders,
  Cookie: 'plu_athlete_session=test-session-token',
}

function authenticatedSupabase() {
  return {
    from: vi.fn((table) => {
      if (table === 'events') {
        const emptyList = {
          not: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              ...emptyList,
            }),
            ...emptyList,
          }),
        }
      }
      if (table !== 'athlete_sessions') throw new Error(`Tabla inesperada: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'session-1',
                athlete_id: '11111111-1111-4111-8111-111111111111',
                expires_at: '2099-01-01T00:00:00Z',
                revoked_at: null,
              },
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: () => ({}) }),
      }
    }),
  }
}

function supabaseWithEvents(rowsBySlug) {
  return {
    from: vi.fn((table) => {
      if (table === 'events') {
        return {
          select: () => ({
            eq: (column, value) => ({
              maybeSingle: async () => ({
                data: column === 'slug' ? (rowsBySlug[value] ?? null) : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table !== 'athlete_sessions') throw new Error(`Tabla inesperada: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'session-1',
                athlete_id: '11111111-1111-4111-8111-111111111111',
                expires_at: '2099-01-01T00:00:00Z',
                revoked_at: null,
              },
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: () => ({}) }),
      }
    }),
  }
}

function plan(code, collectionMode) {
  return {
    id: crypto.randomUUID(),
    code,
    family_code: code,
    version: 1,
    name: code,
    description: '',
    price: 75000,
    currency: 'ARS',
    billing_frequency: 'annual',
    collection_mode: collectionMode,
    interval_count: 1,
    grace_days: 0,
    effective_from: '2026-01-01T00:00:00Z',
    provider_plan_id: null,
  }
}

function completeCompetitionProfile() {
  return {
    full_name: 'Ana Torres',
    birth_date: '1998-04-12',
    sex: 'Femenino',
    gym: 'Pitbull Team',
    phone: '1145678901',
    country: 'Argentina',
    province: 'Buenos Aires',
  }
}

// `APP_PRODUCTION` ya no gatea nada en el backend (removido en el refactor
// "remove APP_PRODUCTION references"): `filterPublicMembershipPlans`,
// `assertRecurringMembershipAvailable` y `assertPricingWritesEnabled`
// (server/lib/featureAvailability.js) quedaron como no-ops a propósito. El
// único freno operativo que sigue vivo es `PAID_CHECKOUT_ENABLED`, ya cubierto
// por "rechaza crear combo, afiliacion e inscripcion cuando paidCheckout esta
// cerrado" más abajo.
describe('features publicas sin gates de pre-lanzamiento', () => {
  it('publica todos los planes, incluido el de débito automático', async () => {
    const listPlans = vi.fn().mockResolvedValue([
      plan('plu-annual', 'one_time'),
      plan('plu-annual-auto', 'recurring'),
    ])
    const target = listen(createApp({
      env: {},
      paymentRepository: { listPlans },
    }))
    try {
      const response = await fetch(`${target.url}/api/payments/plans`)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.plans.map((item) => item.code)).toEqual(['plu-annual', 'plu-annual-auto'])
    } finally {
      await target.close()
    }
  })

  it('ya no rechaza suscripciones: el gate de lanzamiento desapareció y llega a leer la orden', async () => {
    const paymentOrderId = crypto.randomUUID()
    const getOrder = vi.fn().mockResolvedValue({ id: paymentOrderId, kind: 'ticket' })
    const assertTicketOrderAccess = vi.fn().mockResolvedValue(undefined)
    const target = listen(createApp({
      env: {},
      paymentRepository: { getOrder, assertTicketOrderAccess },
    }))
    try {
      const response = await fetch(`${target.url}/api/payments/subscriptions/process`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          paymentOrderId,
          planCode: 'plu-annual-auto',
          cardToken: 'card-token-seguro-123',
        }),
      })

      // El 409 de lanzamiento ya no existe; lo que responda de acá en más
      // depende de la lógica de suscripción real, fuera del alcance de este
      // test — lo que importa es que el gate dejó de cortar antes de leer.
      expect(response.status).not.toBe(409)
      expect(getOrder).toHaveBeenCalledWith(paymentOrderId)
    } finally {
      await target.close()
    }
  })

  it('ya no rechaza una orden recurrente invocada por la ruta directa', async () => {
    // La RPC real siempre envuelve la orden en `{ order }` (create_membership_order_v4,
    // supabase/migrations/20260819100000_discount_codes_and_plan_expiry.sql:639); el mock
    // tiene que respetar ese contrato para que applyPaymentPricing la reconozca.
    const createMembershipOrder = vi.fn().mockResolvedValue({ order: { id: 'order-1', planCode: 'plu-annual-auto-v2' } })
    const target = listen(createApp({
      env: {},
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual-auto-v2', collection_mode: 'recurring' }),
        applyCheckoutPrice: vi.fn().mockResolvedValue({ id: 'order-1', planCode: 'plu-annual-auto-v2' }),
        createMembershipOrder,
      },
    }))
    try {
      const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          paymentMethod: 'mercado_pago',
          planCode: 'plu-annual-auto',
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      expect(response.status).toBe(201)
      expect(createMembershipOrder).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })

  it('permite crear el combo en produccion cuando paidCheckout esta abierto', async () => {
    const createRegistrationCombo = vi.fn().mockResolvedValue({
      order: { id: '22222222-2222-4222-8222-222222222222', concept: 'combo' },
      membership: { id: '33333333-3333-4333-8333-333333333333' },
      registration: { id: '44444444-4444-4444-8444-444444444444' },
    })
    const target = listen(createApp({
      env: { APP_PRODUCTION: 'true', PAID_CHECKOUT_ENABLED: 'true' },
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findCompetitionProfile: vi.fn().mockResolvedValue(completeCompetitionProfile()),
        applyCheckoutPrice: vi.fn().mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222', concept: 'combo' }),
        findEventComboOffer: vi.fn().mockResolvedValue({ price: 170000, manualPrice: null }),
        createRegistrationCombo,
      },
    }))
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          division: 'Open',
          category: 'Raw',
          bodyweightKg: 90,
          paymentMethod: 'mercado_pago',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.order).toMatchObject({ concept: 'combo' })
      expect(createRegistrationCombo).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })

  it('rechaza crear combo, afiliacion e inscripcion cuando paidCheckout esta cerrado', async () => {
    const createMembershipOrder = vi.fn()
    const createRegistration = vi.fn()
    const createRegistrationCombo = vi.fn()
    const target = listen(createApp({
      env: { APP_PRODUCTION: 'true', PAID_CHECKOUT_ENABLED: 'false' },
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual', collection_mode: 'one_time' }),
        createMembershipOrder,
        createRegistration,
        createRegistrationCombo,
      },
    }))
    try {
      const membership = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          paymentMethod: 'mercado_pago',
          planCode: 'plu-annual',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const registration = await fetch(`${target.url}/api/athletes/me/registrations`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          division: 'Open',
          category: 'Raw',
          bodyweightKg: 90,
          paymentMethod: 'mercado_pago',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const combo = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          division: 'Open',
          category: 'Raw',
          bodyweightKg: 90,
          paymentMethod: 'mercado_pago',
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      expect(membership.status).toBe(409)
      expect(await membership.json()).toMatchObject({ code: 'FEATURE_COMING_SOON' })
      expect(registration.status).toBe(409)
      expect(await registration.json()).toMatchObject({ code: 'FEATURE_COMING_SOON' })
      expect(combo.status).toBe(409)
      expect(await combo.json()).toMatchObject({ code: 'FEATURE_COMING_SOON' })
      expect(createMembershipOrder).not.toHaveBeenCalled()
      expect(createRegistration).not.toHaveBeenCalled()
      expect(createRegistrationCombo).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('ya no cierra cobros por estar en produccion, tenga o no abierto registration_opens_at', async () => {
    // Mismo contrato que create_membership_order_v4: la RPC de inscripción
    // también envuelve la orden en `{ order }`.
    const createRegistration = vi.fn().mockResolvedValue({ order: { id: 'reg-1' } })
    const createRegistrationCombo = vi.fn().mockResolvedValue({
      order: { id: '22222222-2222-4222-8222-222222222222', concept: 'combo' },
    })
    const target = listen(createApp({
      env: {},
      supabaseAdmin: supabaseWithEvents({
        'evento-abierto': { registration_opens_at: '2000-01-01T00:00:00Z' },
        'evento-cerrado': { registration_opens_at: '2999-01-01T00:00:00Z' },
      }),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findCompetitionProfile: vi.fn().mockResolvedValue(completeCompetitionProfile()),
        applyCheckoutPrice: vi.fn().mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222', concept: 'combo' }),
        findEventPricing: vi.fn().mockResolvedValue({ price: 85000, manual_price: null }),
        findEventComboOffer: vi.fn().mockResolvedValue({ price: 170000, manualPrice: null }),
        createRegistration,
        createRegistrationCombo,
      },
    }))
    try {
      const attendeeBody = {
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'mercado_pago',
      }
      const pastDate = await fetch(`${target.url}/api/athletes/me/registrations`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ ...attendeeBody, eventSlug: 'evento-abierto', idempotencyKey: crypto.randomUUID() }),
      })
      const futureDate = await fetch(`${target.url}/api/athletes/me/registrations`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ ...attendeeBody, eventSlug: 'evento-cerrado', idempotencyKey: crypto.randomUUID() }),
      })
      const comboPast = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ ...attendeeBody, eventSlug: 'evento-abierto', idempotencyKey: crypto.randomUUID() }),
      })

      expect(pastDate.status).toBe(201)
      expect(futureDate.status).toBe(201)
      expect(comboPast.status).toBe(201)
      expect(createRegistration).toHaveBeenCalledTimes(2)
      expect(createRegistrationCombo).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })
})

describe('interruptores generales de cobro, afiliación e inscripción', () => {
  it('rechaza la compra de entradas cuando el interruptor maestro de cobros está apagado', async () => {
    const createOrder = vi.fn()
    const target = listen(createApp({
      env: {},
      ticketRepository: { createOrder },
      platformSettingsRepository: {
        get: vi.fn().mockResolvedValue({ checkoutEnabled: false }),
      },
    }))
    try {
      const response = await fetch(`${target.url}/api/tickets/orders`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          attendees: [{ fullName: 'Ana Torres', dni: '30111222', ticketTypeId: crypto.randomUUID() }],
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'CHECKOUT_DISABLED' })
      expect(createOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('rechaza afiliación, inscripción y combo cuando su interruptor está apagado', async () => {
    const createMembershipOrder = vi.fn()
    const createRegistration = vi.fn()
    const createRegistrationCombo = vi.fn()
    const target = listen(createApp({
      env: {},
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual', collection_mode: 'one_time' }),
        findCompetitionProfile: vi.fn().mockResolvedValue(completeCompetitionProfile()),
        createMembershipOrder,
        createRegistration,
        createRegistrationCombo,
      },
      platformSettingsRepository: {
        get: vi.fn().mockResolvedValue({ membershipEnabled: false, registrationEnabled: false }),
      },
    }))
    try {
      const membership = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          paymentMethod: 'mercado_pago',
          planCode: 'plu-annual',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const registration = await fetch(`${target.url}/api/athletes/me/registrations`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          division: 'Open',
          category: 'Raw',
          bodyweightKg: 90,
          paymentMethod: 'mercado_pago',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const combo = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          division: 'Open',
          category: 'Raw',
          bodyweightKg: 90,
          paymentMethod: 'mercado_pago',
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      expect(membership.status).toBe(409)
      expect(await membership.json()).toMatchObject({ code: 'MEMBERSHIP_CHECKOUT_DISABLED' })
      expect(registration.status).toBe(409)
      expect(await registration.json()).toMatchObject({ code: 'REGISTRATION_CHECKOUT_DISABLED' })
      expect(combo.status).toBe(409)
      expect(createMembershipOrder).not.toHaveBeenCalled()
      expect(createRegistration).not.toHaveBeenCalled()
      expect(createRegistrationCombo).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('deja pasar afiliación e inscripción cuando los interruptores están prendidos', async () => {
    const createMembershipOrder = vi.fn().mockResolvedValue({ order: { id: 'order-1' } })
    const target = listen(createApp({
      env: {},
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual', collection_mode: 'one_time' }),
        applyCheckoutPrice: vi.fn().mockResolvedValue({ id: 'order-1' }),
        createMembershipOrder,
      },
      platformSettingsRepository: {
        get: vi.fn().mockResolvedValue({ membershipEnabled: true, registrationEnabled: true }),
      },
    }))
    try {
      const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          paymentMethod: 'mercado_pago',
          planCode: 'plu-annual',
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      expect(response.status).toBe(201)
      expect(createMembershipOrder).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })
})
