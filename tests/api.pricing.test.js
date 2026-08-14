import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { comboOfferSchema, membershipPlanVersionSchema } from '../server/routes/pricing.js'
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

async function setup() {
  const staff = await buildStaffUser({ email: 'pricing-admin@plu.test' })
  const prisma = createPrismaDouble([staff])
  const rpc = vi.fn(async (name) => {
    if (name === 'staff_get_pricing_configuration') {
      return { data: { plans: [], events: [] }, error: null }
    }
    return { data: { id: PLAN_ID }, error: null }
  })
  const target = listen(createApp({
    prisma,
    supabaseAdmin: { rpc },
    env: {
      AUTH_SECRET: 'pricing-test-secret',
      APP_URL: 'http://localhost:5173',
    },
  }))
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
      expect(rpc).toHaveBeenCalledWith(
        'staff_create_membership_plan_version',
        expect.anything(),
      )
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
    expect(membershipPlanVersionSchema.safeParse(planPayload({ currency: 'USD' })).success).toBe(false)
    expect(comboOfferSchema.safeParse({
      membershipPlanId: PLAN_ID,
      price: 60000,
      active: true,
      startsAt: '2026-08-20T12:00:00Z',
      endsAt: '2026-08-19T12:00:00Z',
    }).success).toBe(false)
  })
})
