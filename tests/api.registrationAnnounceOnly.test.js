import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Venta de inscripciones por HTTP: "Solo anuncio" no cobra.
 * 50%) y modalidades. La ruta es la autoridad: el navegador solo previsualiza.
 *
 * Fecha del evento fija (2026-11-15): la edad no depende del día que corra la
 * suite. Nacida el 2005-06-01 → 21 años (Junior). Nacido el 1995-01-01 → 31
 * (Open). Nacido el 1980-01-01 → 46 (Masters).
 */

let clientIpCounter = 0
function isolatedClientIp() {
  clientIpCounter += 1
  return `10.${(clientIpCounter >> 16) & 0xff}.${(clientIpCounter >> 8) & 0xff}.${clientIpCounter & 0xff}`
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

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const EVENT_PRICE = 75000
const EVENT_MANUAL_PRICE = 60000

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

function profileBornOn(birthDate) {
  return {
    full_name: 'Atleta de Prueba',
    birth_date: birthDate,
    sex: 'Masculino',
    gym: 'Test Gym',
    phone: '1122334455',
    country: 'Argentina',
    province: 'Buenos Aires',
    division: 'Open',
    category: 'Raw',
    estimated_weight: 90,
  }
}

function buildApp({ birthDate = '2005-06-01', event = {}, toggles = {} } = {}) {
  const createRegistration = vi.fn().mockResolvedValue({ order: { id: 'order-registration' } })
  const previewDiscountCode = vi.fn().mockResolvedValue({ valid: false, reason: 'not_found' })

  const app = createApp({
    env: { PAID_CHECKOUT_ENABLED: 'true' },
    supabaseAdmin: authenticatedSupabase(),
    registrationAccessRepository: {
      findActiveGate: vi.fn().mockResolvedValue(null),
      recordUse: vi.fn(),
    },
    platformSettingsRepository: {
      get: vi.fn().mockResolvedValue({ registrationManualEnabled: true, ...toggles }),
    },
    athleteRepository: {
      findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
      findCompetitionProfile: vi.fn().mockResolvedValue(profileBornOn(birthDate)),
      findEventPricing: vi.fn().mockResolvedValue({
        slug: 'pitbull-classic-2026',
        starts_at: '2026-11-15T12:00:00Z',
        price: EVENT_PRICE,
        manual_price: EVENT_MANUAL_PRICE,
        ...event,
      }),
      discountCodeManualEligibility: vi.fn().mockResolvedValue(false),
      discountCodeChannelPolicy: vi
        .fn()
        .mockResolvedValue({ found: false, manualChannels: [], mercadoPagoEnabled: true }),
      previewDiscountCode,
      createRegistration,
    },
  })

  return { target: listen(app), createRegistration, previewDiscountCode }
}

function registrationBody(extra = {}) {
  return {
    eventSlug: 'pitbull-classic-2026',
    division: 'Junior',
    category: 'Raw',
    modalities: ['full_power'],
    bodyweightKg: 90,
    declaredWeightClass: '90',
    paymentMethod: 'mercado_pago',
    idempotencyKey: crypto.randomUUID(),
    ...extra,
  }
}

async function register(app, body) {
  return fetch(`${app.target.url}/api/athletes/me/registrations`, {
    method: 'POST',
    headers: athleteHeaders(),
    body: JSON.stringify(body),
  })
}

async function withApp(options, run) {
  const app = buildApp(options)
  try {
    await run(app)
  } finally {
    await app.target.close()
  }
}

describe('inscripción — "Solo anuncio"', () => {
  it('rechaza el checkout de un evento publicado solo como anuncio', async () => {
    await withApp({ event: { rules: { salesIntent: 'announce' } } }, async (app) => {
      const response = await register(app, registrationBody())
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.code).toBe('REGISTRATION_ANNOUNCE_ONLY')
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('con el cobro activo (charge o sin intención guardada) sigue creando la orden', async () => {
    await withApp({ event: { rules: { salesIntent: 'charge' } } }, async (app) => {
      expect((await register(app, registrationBody())).status).toBe(201)
    })
    await withApp({ event: { rules: null } }, async (app) => {
      expect((await register(app, registrationBody())).status).toBe(201)
    })
  })
})
