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

describe('features publicas con APP_PRODUCTION', () => {
  it('no publica el plan de debito automatico', async () => {
    const listPlans = vi.fn().mockResolvedValue([
      plan('plu-annual', 'one_time'),
      plan('plu-annual-auto', 'recurring'),
    ])
    const target = listen(createApp({
      env: { APP_PRODUCTION: 'true' },
      paymentRepository: { listPlans },
    }))
    try {
      const response = await fetch(`${target.url}/api/payments/plans`)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.plans.map((item) => item.code)).toEqual(['plu-annual'])
    } finally {
      await target.close()
    }
  })

  it('rechaza suscripciones antes de leer o mutar una orden', async () => {
    const getOrder = vi.fn()
    const target = listen(createApp({
      env: { APP_PRODUCTION: 'true' },
      paymentRepository: { getOrder },
    }))
    try {
      const response = await fetch(`${target.url}/api/payments/subscriptions/process`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          paymentOrderId: crypto.randomUUID(),
          planCode: 'plu-annual-auto',
          cardToken: 'card-token-seguro-123',
        }),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'FEATURE_COMING_SOON' })
      expect(getOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('rechaza crear una orden recurrente aunque se invoque la ruta directa', async () => {
    const createMembershipOrder = vi.fn()
    const target = listen(createApp({
      env: { APP_PRODUCTION: 'true' },
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual-auto-v2', collection_mode: 'recurring' }),
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

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'FEATURE_COMING_SOON' })
      expect(createMembershipOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('permite crear el combo en produccion', async () => {
    const createRegistrationCombo = vi.fn().mockResolvedValue({
      order: { id: '22222222-2222-4222-8222-222222222222', concept: 'combo' },
      membership: { id: '33333333-3333-4333-8333-333333333333' },
      registration: { id: '44444444-4444-4444-8444-444444444444' },
    })
    const target = listen(createApp({
      env: { APP_PRODUCTION: 'true' },
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
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
})
