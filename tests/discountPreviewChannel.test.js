import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { toApiPaymentMethod } from '../src/services/checkoutPricing.js'

/**
 * El preview de un cupón calculaba el ahorro sobre el precio de catálogo
 * (`membership_plans.price` / `events.price`), mientras que el cobro real lo fija
 * `checkoutPriceFor`, que durante la ventana Pitbull cambia según el canal:
 * 75.000 por transferencia o efectivo, 85.000 por Mercado Pago.
 *
 * Resultado: el atleta veía "ahorrás $X" y se le cobraba otra cosa. El preview
 * ahora recibe el canal y cotiza contra la misma política que la orden.
 */

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
// Precio de catálogo deliberadamente distinto a los dos valores de la política:
// si el preview lo usara, el assert de abajo lo delata.
const CATALOG_PRICE = 100000

let clientIpCounter = 0
function isolatedClientIp() {
  clientIpCounter += 1
  return `10.${(clientIpCounter >> 16) & 0xff}.${(clientIpCounter >> 8) & 0xff}.${clientIpCounter & 0xff}`
}

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function athleteHeaders() {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    'x-vercel-forwarded-for': isolatedClientIp(),
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
  const previewDiscountCode = vi.fn().mockResolvedValue({
    valid: true,
    percentOff: 10,
    discountAmount: 1,
    finalAmount: 1,
  })

  const app = createApp({
    env: { PAID_CHECKOUT_ENABLED: 'true' },
    supabaseAdmin: authenticatedSupabase(),
    athleteRepository: {
      findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
      findMembershipPlan: vi.fn().mockResolvedValue({ code: 'plu-annual', price: CATALOG_PRICE }),
      findEventPricing: vi.fn().mockResolvedValue({ slug: 'pitbull-classic-2026', price: CATALOG_PRICE }),
      previewDiscountCode,
    },
  })

  return { target: listen(app), previewDiscountCode }
}

function preview(target, body) {
  return fetch(`${target.url}/api/athletes/me/discount-preview`, {
    method: 'POST',
    headers: athleteHeaders(),
    body: JSON.stringify(body),
  })
}

describe('normalización del canal de pago hacia la API', () => {
  it('traduce el nombre que usa la UI al que entiende el backend', () => {
    // La UI llama `transferencia` a lo que la API llama `manual_link`: sin la
    // traducción el preview cotizaba como Mercado Pago y mostraba menos ahorro.
    expect(toApiPaymentMethod('transferencia')).toBe('manual_link')
    expect(toApiPaymentMethod('manual_link')).toBe('manual_link')
    expect(toApiPaymentMethod('cash_pitbull')).toBe('cash_pitbull')
    expect(toApiPaymentMethod('mercado_pago')).toBe('mercado_pago')
  })

  it('no inventa un canal cuando no hay ninguno elegido', () => {
    expect(toApiPaymentMethod(undefined)).toBeNull()
    expect(toApiPaymentMethod('bitcoin')).toBeNull()
  })
})

describe('POST /api/athletes/me/discount-preview', () => {
  it('cotiza la afiliación por transferencia al precio del canal, no al de catálogo', async () => {
    const { target, previewDiscountCode } = buildApp()
    try {
      const response = await preview(target, {
        code: 'PLU10',
        appliesTo: 'membership',
        planCode: 'plu-annual',
        paymentMethod: 'manual_link',
      })

      expect(response.status).toBe(200)
      expect(previewDiscountCode).toHaveBeenCalledWith(ATHLETE_ID, {
        code: 'PLU10',
        appliesTo: 'membership',
        baseAmount: 75000,
      })
    } finally {
      await target.close()
    }
  })

  it('cotiza más caro por Mercado Pago, que es lo que efectivamente se cobra', async () => {
    const { target, previewDiscountCode } = buildApp()
    try {
      await preview(target, {
        code: 'PLU10',
        appliesTo: 'membership',
        planCode: 'plu-annual',
        paymentMethod: 'mercado_pago',
      })

      expect(previewDiscountCode).toHaveBeenCalledWith(ATHLETE_ID, {
        code: 'PLU10',
        appliesTo: 'membership',
        baseAmount: 85000,
      })
    } finally {
      await target.close()
    }
  })

  it('aplica la misma política a la inscripción', async () => {
    const { target, previewDiscountCode } = buildApp()
    try {
      await preview(target, {
        code: 'PLU10',
        appliesTo: 'registration',
        eventSlug: 'pitbull-classic-2026',
        paymentMethod: 'cash_pitbull',
      })

      expect(previewDiscountCode).toHaveBeenCalledWith(ATHLETE_ID, {
        code: 'PLU10',
        appliesTo: 'registration',
        baseAmount: 75000,
      })
    } finally {
      await target.close()
    }
  })

  it('vuelve al precio de catálogo si el cliente no manda canal', async () => {
    // Compatibilidad hacia atrás: un cliente viejo que no envía `paymentMethod`
    // sigue recibiendo una cotización, aunque sea la de catálogo.
    const { target, previewDiscountCode } = buildApp()
    try {
      await preview(target, {
        code: 'PLU10',
        appliesTo: 'membership',
        planCode: 'plu-annual',
      })

      expect(previewDiscountCode).toHaveBeenCalledWith(ATHLETE_ID, {
        code: 'PLU10',
        appliesTo: 'membership',
        baseAmount: CATALOG_PRICE,
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza un canal que no existe', async () => {
    const { target, previewDiscountCode } = buildApp()
    try {
      const response = await preview(target, {
        code: 'PLU10',
        appliesTo: 'membership',
        planCode: 'plu-annual',
        paymentMethod: 'bitcoin',
      })

      expect(response.status).toBe(400)
      expect(previewDiscountCode).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})
