import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  comboOfferSchema,
  discountCodeSchema,
  membershipPlanVersionSchema,
} from '../server/routes/pricing.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const PLAN_ID = '11111111-1111-4111-8111-111111111111'

function planPayload(overrides = {}) {
  return {
    familyCode: 'plu-anual',
    name: 'Afiliación anual',
    description: 'Credencial y calendario oficial.',
    price: 42000,
    currency: 'ARS',
    billingFrequency: 'annual',
    collectionMode: 'one_time',
    intervalCount: 1,
    graceDays: 0,
    effectiveFrom: '',
    ...overrides,
  }
}

function discountCodePayload(overrides = {}) {
  return {
    code: 'BIENVENIDA-25',
    description: 'Beneficio de bienvenida.',
    percentOff: 25,
    appliesTo: 'both',
    maxRedemptions: 30,
    expiresAt: '2026-12-31T23:59:00Z',
    active: true,
    ...overrides,
  }
}

async function setup() {
  const staff = await buildStaffUser({ email: 'pricing-admin@plu.test' })
  const prisma = createPrismaDouble([staff])
  const rpc = vi.fn(async (name) => {
    if (name === 'staff_get_pricing_configuration') {
      return { data: { plans: [], events: [] }, error: null }
    }
    return { data: { id: PLAN_ID }, error: null }
  })
  const target = listen(
    createApp({
      prisma,
      supabaseAdmin: { rpc },
      env: {
        AUTH_SECRET: 'pricing-test-secret',
        APP_URL: 'http://localhost:5173',
      },
    }),
  )
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { cookie, rpc, target }
}

describe('configuración económica administrativa', () => {
  it('devuelve catálogo y disponibilidad de edición', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/pricing`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        plans: [],
        events: [],
        availability: { editable: true, reason: null },
      })
      expect(rpc).toHaveBeenCalledWith('staff_get_pricing_configuration', {})
    } finally {
      await target.close()
    }
  })

  // El lanzamiento público ya está en producción: la config económica se
  // edita siempre, sin el gate de APP_PRODUCTION que existía antes del
  // lanzamiento (removido en el refactor "remove APP_PRODUCTION references").
  it('permite crear versiones de plan sin ningún gate de lanzamiento', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/pricing/membership-plans/versions`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(planPayload()),
      })
      expect(response.status).toBe(201)
      expect(rpc).toHaveBeenCalledWith('staff_create_membership_plan_version', expect.anything())
    } finally {
      await target.close()
    }
  })

  it('permite eliminar un plan sin referencias desde el panel', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/pricing/membership-plans/${PLAN_ID}`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id: PLAN_ID })
      expect(rpc).toHaveBeenCalledWith('staff_delete_membership_plan', {
        p_plan_id: PLAN_ID,
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('valida importes, moneda y ventanas antes de persistir', () => {
    expect(membershipPlanVersionSchema.safeParse(planPayload({ price: 0 })).success).toBe(false)
    expect(membershipPlanVersionSchema.safeParse(planPayload({ currency: 'USD' })).success).toBe(
      false,
    )
    expect(
      comboOfferSchema.safeParse({
        membershipPlanId: PLAN_ID,
        price: 60000,
        active: true,
        startsAt: '2026-08-20T12:00:00Z',
        endsAt: '2026-08-19T12:00:00Z',
      }).success,
    ).toBe(false)
  })

  it('crea cupones para afiliaciones e inscripciones y conserva sus límites', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/pricing/discount-codes`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(discountCodePayload()),
      })

      expect(response.status).toBe(201)
      expect(rpc).toHaveBeenCalledWith('staff_upsert_discount_code', {
        p_code: expect.objectContaining({
          code: 'BIENVENIDA-25',
          percentOff: 25,
          appliesTo: 'both',
          maxRedemptions: 30,
          active: true,
        }),
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('no permite cupones gratis sin un flujo de confirmación específico', () => {
    expect(discountCodeSchema.safeParse(discountCodePayload({ percentOff: 100 })).success).toBe(
      false,
    )
    expect(discountCodeSchema.safeParse(discountCodePayload({ code: 'MAL@' })).success).toBe(false)
  })

  it('acepta una promo de precio fijo con alcance único y descarta el porcentaje', () => {
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        code: 'PITBULL',
        kind: 'fixed_price',
        fixedPrice: 120000,
        appliesTo: 'combo',
        percentOff: 25,
      }),
    )

    expect(parsed.success).toBe(true)
    expect(parsed.data.fixedPrice).toBe(120000)
    // El porcentaje viaja en el payload pero no llega a la base: cada
    // modalidad guarda sólo su propio campo.
    expect(parsed.data.percentOff).toBeUndefined()
  })

  it('rechaza una promo de precio fijo sin importe o con alcance combinado', () => {
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ kind: 'fixed_price', appliesTo: 'combo', percentOff: undefined }),
      ).success,
    ).toBe(false)
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ kind: 'fixed_price', fixedPrice: 120000, appliesTo: 'both' }),
      ).success,
    ).toBe(false)
  })

  it('exige el porcentaje cuando el código es un descuento', () => {
    expect(
      discountCodeSchema.safeParse(discountCodePayload({ percentOff: undefined })).success,
    ).toBe(false)
  })

  it('admite el alcance combo para un descuento por porcentaje', () => {
    const parsed = discountCodeSchema.safeParse(discountCodePayload({ appliesTo: 'combo' }))
    expect(parsed.success).toBe(true)
    expect(parsed.data.kind).toBe('percent')
    expect(parsed.data.fixedPrice).toBeUndefined()
  })
})
