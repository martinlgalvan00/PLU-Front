import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'

/**
 * api.discountPreviewRateBucket.test.js — PLU ARG
 *
 * El preview de precios tiene DOS baldes de rate limit según viaje un código:
 *
 *   - Con código es un intento sobre el espacio de códigos y cuenta en el
 *     balde estricto de enumeración (`promotion-code`, 30 cada 15 minutos).
 *   - Sin código es la consulta de la promo pública, que el checkout dispara
 *     en cada montaje y en cada cambio de canal o de paquete. No enumera nada
 *     — no viaja ningún código — y compartir el balde estricto hacía que
 *     mirar el checkout y alternar medios agotara el cupo: el canje legítimo
 *     que venía después respondía 429 (visto en QA con los códigos
 *     ONLY-PITBULL-*).
 */

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function athleteHeaders(ip) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    'x-vercel-forwarded-for': ip,
    Cookie: 'plu_athlete_session=test-session-token',
  }
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
                athlete_id: ATHLETE_ID,
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

function buildApp() {
  const app = createApp({
    env: { PAID_CHECKOUT_ENABLED: 'true' },
    supabaseAdmin: authenticatedSupabase(),
    athleteRepository: {
      findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
      findMembershipPlan: vi.fn().mockResolvedValue({
        code: 'plu-annual',
        price: 100000,
        manual_price: 85000,
      }),
      previewDiscountCode: vi
        .fn()
        .mockResolvedValue({ valid: true, percentOff: 10, discountAmount: 1, finalAmount: 1 }),
    },
  })
  return listen(app)
}

function preview(target, ip, body) {
  return fetch(`${target.url}/api/athletes/me/discount-preview`, {
    method: 'POST',
    headers: athleteHeaders(ip),
    body: JSON.stringify(body),
  })
}

const WITH_CODE = { code: 'PLU10', appliesTo: 'membership', planCode: 'plu-annual' }
const PUBLIC_PROMO = { appliesTo: 'membership', planCode: 'plu-annual' }

describe('POST /api/athletes/me/discount-preview — baldes por tipo de consulta', () => {
  it('agotado el balde de códigos, la promo pública sigue cotizando', async () => {
    const target = buildApp()
    const ip = '203.0.113.77'
    try {
      // 30 intentos con código: el cupo completo del balde estricto por IP.
      let last = null
      for (let attempt = 0; attempt < 30; attempt += 1) {
        last = await preview(target, ip, WITH_CODE)
      }
      expect(last.status).toBe(200)

      // El intento 31 con código rebota: la enumeración sigue frenada.
      const exhausted = await preview(target, ip, WITH_CODE)
      expect(exhausted.status).toBe(429)

      // Pero el preview SIN código —la promo pública del checkout— vive en su
      // propio balde y sigue respondiendo desde la misma IP.
      const publicPromo = await preview(target, ip, PUBLIC_PROMO)
      expect(publicPromo.status).toBe(200)
    } finally {
      await target.close()
    }
  }, 20000)

  it('mirar el checkout no gasta el cupo del canje', async () => {
    const target = buildApp()
    const ip = '203.0.113.78'
    try {
      // Una sesión charlatana de checkout: montaje + cambios de canal/paquete.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await preview(target, ip, PUBLIC_PROMO)
        expect(response.status).toBe(200)
      }

      // El canje real que viene después conserva su cupo completo.
      const redeem = await preview(target, ip, WITH_CODE)
      expect(redeem.status).toBe(200)
    } finally {
      await target.close()
    }
  }, 20000)
})
