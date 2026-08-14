import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'
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

// Tanda privada de afiliación con código real hasheado: cubre punta a punta
// lo que hasta ahora solo probaba `registrationAccessService.test.js` de
// forma aislada (repositorio mockeado, sin pasar por Express ni por el hash).
describe('tanda privada de afiliación — POST /me/membership-orders', () => {
  async function buildApp(gateHash) {
    const findActiveGate = vi.fn().mockResolvedValue({
      id: 'gate-1',
      scope: 'membership',
      code_hash: gateHash,
    })
    const recordUse = vi.fn().mockResolvedValue(undefined)
    const createMembershipOrder = vi.fn().mockResolvedValue({ order: { id: 'order-1' } })
    const app = createApp({
      env: {},
      supabaseAdmin: authenticatedSupabase(),
      registrationAccessRepository: { findActiveGate, recordUse },
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual', collection_mode: 'one_time' }),
        applyCheckoutPrice: vi.fn().mockResolvedValue({ id: 'order-1' }),
        createMembershipOrder,
      },
    })
    return { target: listen(app), createMembershipOrder, recordUse }
  }

  it('rechaza la orden sin código cuando la tanda está activa', async () => {
    const { target, createMembershipOrder } = await buildApp(await hashPassword('TANDA-PLU-2026'))
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
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'REGISTRATION_ACCESS_CODE_REQUIRED' })
      expect(createMembershipOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('rechaza la orden con el código equivocado', async () => {
    const { target, createMembershipOrder } = await buildApp(await hashPassword('TANDA-PLU-2026'))
    try {
      const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          paymentMethod: 'mercado_pago',
          planCode: 'plu-annual',
          accessCode: 'CODIGO-INCORRECTO',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'REGISTRATION_ACCESS_CODE_INVALID' })
      expect(createMembershipOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('deja pasar la orden con el código correcto y audita el uso', async () => {
    const { target, createMembershipOrder, recordUse } = await buildApp(await hashPassword('TANDA-PLU-2026'))
    try {
      const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({
          paymentMethod: 'mercado_pago',
          planCode: 'plu-annual',
          accessCode: 'TANDA-PLU-2026',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      expect(response.status).toBe(201)
      expect(createMembershipOrder).toHaveBeenCalledOnce()
      expect(createMembershipOrder).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        expect.objectContaining({
          paymentMethod: 'mercado_pago',
          orderAmount: 85000,
          manualPaymentChannel: null,
        }),
      )
      expect(recordUse).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })

  it('sin tanda activa no exige código', async () => {
    const findActiveGate = vi.fn().mockResolvedValue(null)
    const createMembershipOrder = vi.fn().mockResolvedValue({ order: { id: 'order-1' } })
    const target = listen(createApp({
      env: {},
      supabaseAdmin: authenticatedSupabase(),
      registrationAccessRepository: { findActiveGate, recordUse: vi.fn() },
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
        findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual', collection_mode: 'one_time' }),
        applyCheckoutPrice: vi.fn().mockResolvedValue({ id: 'order-1' }),
        createMembershipOrder,
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
