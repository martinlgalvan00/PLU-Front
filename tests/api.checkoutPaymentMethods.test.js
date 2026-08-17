import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Matriz de medios de pago por HTTP, sin Supabase.
 *
 * Lo que no está cubierto en otro lado es el tramo del medio: que la ruta
 * traduzca lo que elige el atleta a lo que se persiste, y que el precio por
 * defecto y el precio manual del plan/evento/combo (`membership_plans`,
 * `events`, `event_combo_offers` — columnas `price`/`manual_price`) lleguen
 * intactos a la RPC. Cuál de los dos termina cobrándose ya no lo decide esta
 * capa: lo decide `plu_private.configure_atomic_checkout_pricing` en la misma
 * transacción que crea la orden (ver `atomicCheckoutPricing.test.js` y los
 * tests de integración para esa parte).
 *
 *   elige "efectivo en Pitbull" (cash_pitbull)
 *     -> se guarda method = 'manual_link', canal = 'cash_pitbull'
 *   elige "transferencia" (manual_link)
 *     -> se guarda method = 'manual_link', canal = 'bank_transfer'
 *   elige "Mercado Pago"
 *     -> se guarda method = 'mercado_pago', canal = null
 *
 * El canal es el que decide después si `approve_athlete_payment_order` exige
 * comprobante. Un efectivo guardado como transferencia no se puede aprobar
 * nunca, porque espera un archivo que nadie va a subir.
 */

/**
 * Los limiters viven en el módulo, con store en memoria y clave por IP, así que
 * todos los `listen()` de la suite comparten balde: esta matriz hace bastante
 * más de 30 altas y el `publicWriteLimiter` empezaba a devolver 429 a mitad de
 * archivo. Cada request se presenta con su propia IP —`x-vercel-forwarded-for`
 * es lo primero que mira `clientKey`— para medir la ruta y no el limiter.
 *
 * El limiter tiene su propia cobertura en `infrastructureHardening.test.js`.
 */
let clientIpCounter = 0
function isolatedClientIp() {
  clientIpCounter += 1
  return `10.${(clientIpCounter >> 16) & 0xff}.${(clientIpCounter >> 8) & 0xff}.${clientIpCounter & 0xff}`
}

function mutationHeaders() {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    'x-vercel-forwarded-for': isolatedClientIp(),
  }
}

function athleteHeaders() {
  return {
    ...mutationHeaders(),
    Cookie: 'plu_athlete_session=test-session-token',
  }
}

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const DEFAULT_PRICE = 85000
const MANUAL_PRICE = 75000
const COMBO_DEFAULT_PRICE = 170000
const COMBO_MANUAL_PRICE = 120000

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

const COMPLETE_COMPETITION_PROFILE = {
  full_name: 'Atleta de Prueba',
  birth_date: '1995-01-01',
  sex: 'Masculino',
  gym: 'Test Gym',
  phone: '1122334455',
  country: 'Argentina',
  province: 'Buenos Aires',
}

function buildApp({ toggles = {} } = {}) {
  const createMembershipOrder = vi.fn().mockResolvedValue({ order: { id: 'order-membership' } })
  const createRegistration = vi.fn().mockResolvedValue({ order: { id: 'order-registration' } })
  const createRegistrationCombo = vi.fn().mockResolvedValue({ order: { id: 'order-combo' } })

  const app = createApp({
    // Override explícito: sin esto la ruta de inscripción sale a buscar la
    // fecha de apertura del evento a Supabase, que acá está mockeado.
    env: { PAID_CHECKOUT_ENABLED: 'true' },
    supabaseAdmin: authenticatedSupabase(),
    registrationAccessRepository: {
      findActiveGate: vi.fn().mockResolvedValue(null),
      recordUse: vi.fn(),
    },
    platformSettingsRepository: { get: vi.fn().mockResolvedValue(toggles) },
    athleteRepository: {
      findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
      findCompetitionProfile: vi.fn().mockResolvedValue(COMPLETE_COMPETITION_PROFILE),
      findMembershipPlan: vi.fn().mockResolvedValue({
        code: 'plu-annual',
        collection_mode: 'one_time',
        price: DEFAULT_PRICE,
        manual_price: MANUAL_PRICE,
      }),
      findEventPricing: vi.fn().mockResolvedValue({
        slug: 'pitbull-classic-2026',
        price: DEFAULT_PRICE,
        manual_price: MANUAL_PRICE,
      }),
      findEventComboOffer: vi.fn().mockResolvedValue({
        price: COMBO_DEFAULT_PRICE,
        manualPrice: COMBO_MANUAL_PRICE,
      }),
      discountCodeManualEligibility: vi.fn().mockResolvedValue(false),
      createMembershipOrder,
      createRegistration,
      createRegistrationCombo,
    },
  })

  return {
    target: listen(app),
    createMembershipOrder,
    createRegistration,
    createRegistrationCombo,
  }
}

function membershipBody(paymentMethod, extra = {}) {
  return {
    paymentMethod,
    planCode: 'plu-annual',
    idempotencyKey: crypto.randomUUID(),
    ...extra,
  }
}

function registrationBody(paymentMethod, extra = {}) {
  return {
    eventSlug: 'pitbull-classic-2026',
    division: 'Open',
    category: 'Raw',
    bodyweightKg: 90,
    paymentMethod,
    idempotencyKey: crypto.randomUUID(),
    ...extra,
  }
}

function post(target, path, body) {
  return fetch(`${target.url}${path}`, {
    method: 'POST',
    headers: athleteHeaders(),
    body: JSON.stringify(body),
  })
}

describe('afiliación — medio de pago elegido vs. orden persistida', () => {
  it.each([
    ['Mercado Pago', 'mercado_pago', 'mercado_pago', null],
    ['transferencia bancaria', 'manual_link', 'manual_link', 'bank_transfer'],
    ['efectivo en Pitbull', 'cash_pitbull', 'manual_link', 'cash_pitbull'],
  ])('%s crea la orden con el método, el canal y los precios correctos', async (
    _label,
    paymentMethod,
    storedMethod,
    manualChannel,
  ) => {
    const { target, createMembershipOrder } = buildApp({
      toggles: paymentMethod === 'mercado_pago' ? {} : { membershipManualEnabled: true },
    })
    try {
      const response = await post(target, '/api/athletes/me/membership-orders', membershipBody(paymentMethod))
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)

      expect(createMembershipOrder).toHaveBeenCalledOnce()
      expect(createMembershipOrder).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          paymentMethod: storedMethod,
          manualPaymentChannel: manualChannel,
          planCode: 'plu-annual',
          defaultPrice: DEFAULT_PRICE,
          manualPrice: MANUAL_PRICE,
        }),
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza un medio de pago que no existe', async () => {
    const { target, createMembershipOrder } = buildApp()
    try {
      const response = await post(target, '/api/athletes/me/membership-orders', membershipBody('bitcoin'))
      expect(response.status).toBe(400)
      expect(createMembershipOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('inscripción a torneo — medio de pago elegido vs. orden persistida', () => {
  it.each([
    ['Mercado Pago', 'mercado_pago', 'mercado_pago', null],
    ['transferencia bancaria', 'manual_link', 'manual_link', 'bank_transfer'],
    ['efectivo en Pitbull', 'cash_pitbull', 'manual_link', 'cash_pitbull'],
  ])('%s crea la inscripción con el método, el canal y los precios correctos', async (
    _label,
    paymentMethod,
    storedMethod,
    manualChannel,
  ) => {
    const { target, createRegistration } = buildApp({
      toggles: paymentMethod === 'mercado_pago' ? {} : { registrationManualEnabled: true },
    })
    try {
      const response = await post(target, '/api/athletes/me/registrations', registrationBody(paymentMethod))
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)

      expect(createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          paymentMethod: storedMethod,
          manualPaymentChannel: manualChannel,
          eventSlug: 'pitbull-classic-2026',
          defaultPrice: DEFAULT_PRICE,
          manualPrice: MANUAL_PRICE,
        }),
      )
    } finally {
      await target.close()
    }
  })
})

describe('combo afiliación + inscripción — medio de pago elegido vs. orden persistida', () => {
  it.each([
    ['Mercado Pago', 'mercado_pago', 'mercado_pago', null],
    ['transferencia bancaria', 'manual_link', 'manual_link', 'bank_transfer'],
    ['efectivo en Pitbull', 'cash_pitbull', 'manual_link', 'cash_pitbull'],
  ])('%s crea el combo con el método, el canal y los precios correctos', async (
    _label,
    paymentMethod,
    storedMethod,
    manualChannel,
  ) => {
    const { target, createRegistrationCombo } = buildApp({
      toggles: paymentMethod === 'mercado_pago'
        ? {}
        : { membershipManualEnabled: true, registrationManualEnabled: true },
    })
    try {
      const response = await post(target, '/api/athletes/me/registration-combos', registrationBody(paymentMethod))
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)

      expect(createRegistrationCombo).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          paymentMethod: storedMethod,
          manualPaymentChannel: manualChannel,
          defaultPrice: COMBO_DEFAULT_PRICE,
          manualPrice: COMBO_MANUAL_PRICE,
        }),
      )
    } finally {
      await target.close()
    }
  })
})

describe('interruptores del panel sobre los medios de pago', () => {
  it('cierra transferencia y efectivo pero deja pasar Mercado Pago', async () => {
    const toggles = { membershipManualEnabled: false }

    for (const paymentMethod of ['manual_link', 'cash_pitbull']) {
      const { target, createMembershipOrder } = buildApp({ toggles })
      try {
        const response = await post(target, '/api/athletes/me/membership-orders', membershipBody(paymentMethod))
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ code: 'MEMBERSHIP_MANUAL_DISABLED' })
        expect(createMembershipOrder).not.toHaveBeenCalled()
      } finally {
        await target.close()
      }
    }

    // El interruptor manual no puede llevarse puesta la pasarela: si lo hiciera,
    // apagar transferencia dejaría la afiliación sin ningún medio de pago.
    const { target, createMembershipOrder } = buildApp({ toggles })
    try {
      const response = await post(target, '/api/athletes/me/membership-orders', membershipBody('mercado_pago'))
      expect(response.status).toBe(201)
      expect(createMembershipOrder).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })

  it('el interruptor de afiliación corta los tres medios', async () => {
    for (const paymentMethod of ['mercado_pago', 'manual_link', 'cash_pitbull']) {
      const { target, createMembershipOrder } = buildApp({ toggles: { membershipEnabled: false } })
      try {
        const response = await post(target, '/api/athletes/me/membership-orders', membershipBody(paymentMethod))
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ code: 'MEMBERSHIP_CHECKOUT_DISABLED' })
        expect(createMembershipOrder).not.toHaveBeenCalled()
      } finally {
        await target.close()
      }
    }
  })

  it('el interruptor maestro de cobros corta antes que cualquier otro', async () => {
    const { target, createMembershipOrder } = buildApp({ toggles: { checkoutEnabled: false } })
    try {
      const response = await post(target, '/api/athletes/me/membership-orders', membershipBody('mercado_pago'))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'CHECKOUT_DISABLED' })
      expect(createMembershipOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('el canal manual de inscripción no afecta a la afiliación habilitada', async () => {
    const toggles = { membershipManualEnabled: true, registrationManualEnabled: false }

    const membership = buildApp({ toggles })
    try {
      const response = await post(
        membership.target,
        '/api/athletes/me/membership-orders',
        membershipBody('manual_link'),
      )
      expect(response.status).toBe(201)
    } finally {
      await membership.target.close()
    }

    const registration = buildApp({ toggles })
    try {
      const response = await post(
        registration.target,
        '/api/athletes/me/registrations',
        registrationBody('manual_link'),
      )
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'REGISTRATION_MANUAL_DISABLED' })
    } finally {
      await registration.target.close()
    }
  })

  it('el combo manual necesita los dos canales abiertos', async () => {
    for (const closed of ['membershipManualEnabled', 'registrationManualEnabled']) {
      const { target, createRegistrationCombo } = buildApp({ toggles: { [closed]: false } })
      try {
        const response = await post(
          target,
          '/api/athletes/me/registration-combos',
          registrationBody('cash_pitbull'),
        )
        expect(response.status).toBe(409)
        expect(createRegistrationCombo).not.toHaveBeenCalled()
      } finally {
        await target.close()
      }
    }
  })

  it('sin interruptores definidos Mercado Pago sigue abierto y el manual se rechaza', async () => {
    const { target, createMembershipOrder } = buildApp({ toggles: undefined })
    try {
      const response = await post(target, '/api/athletes/me/membership-orders', membershipBody('cash_pitbull'))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'MEMBERSHIP_MANUAL_DISABLED' })
      expect(createMembershipOrder).not.toHaveBeenCalled()

      const mercadoPago = await post(target, '/api/athletes/me/membership-orders', membershipBody('mercado_pago'))
      expect(mercadoPago.status).toBe(201)
      expect(createMembershipOrder).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })
})

/**
 * El otro extremo del interruptor: lo que el checkout lee para decidir qué
 * medios pinta. Si esto miente, el atleta elige transferencia y se come un 409
 * recién al enviar el formulario -- que es exactamente el bug que el endpoint
 * vino a resolver.
 */
describe('requisitos que lee el checkout público', () => {
  async function requirements(toggles) {
    const { target } = buildApp({ toggles })
    try {
      const response = await fetch(
        `${target.url}/api/athletes/me/registration-access-requirements`,
        { headers: athleteHeaders() },
      )
      expect(response.status).toBe(200)
      return await response.json()
    } finally {
      await target.close()
    }
  }

  it('anuncia Mercado Pago como único canal manual si no hay configuración', async () => {
    expect(await requirements({})).toMatchObject({
      membershipEnabled: true,
      registrationEnabled: true,
      membershipManualEnabled: false,
      registrationManualEnabled: false,
    })
  })

  it('esconde transferencia y efectivo de afiliación sin tocar la pasarela', async () => {
    expect(await requirements({ membershipManualEnabled: false })).toMatchObject({
      membershipEnabled: true,
      membershipManualEnabled: false,
      registrationManualEnabled: false,
    })
  })

  it('el interruptor maestro apaga todos los medios de una vez', async () => {
    expect(await requirements({ checkoutEnabled: false })).toMatchObject({
      membershipEnabled: false,
      registrationEnabled: false,
      membershipManualEnabled: false,
      registrationManualEnabled: false,
    })
  })

  it('cerrar el alta de afiliación también cierra su canal manual', async () => {
    // Sin esto el checkout ofrecería transferencia para un concepto que ya no
    // acepta órdenes nuevas por ningún medio.
    expect(await requirements({ membershipEnabled: false })).toMatchObject({
      membershipEnabled: false,
      membershipManualEnabled: false,
      registrationEnabled: true,
    })
  })
})

describe('requisitos previos comunes a todos los medios de pago', () => {
  it('exige el correo verificado antes de cobrar, sea cual sea el medio', async () => {
    for (const paymentMethod of ['mercado_pago', 'manual_link', 'cash_pitbull']) {
      const createMembershipOrder = vi.fn()
      const target = listen(createApp({
        env: { PAID_CHECKOUT_ENABLED: 'true' },
        supabaseAdmin: authenticatedSupabase(),
        registrationAccessRepository: { findActiveGate: vi.fn().mockResolvedValue(null), recordUse: vi.fn() },
        platformSettingsRepository: {
          get: vi.fn().mockResolvedValue(
            paymentMethod === 'mercado_pago' ? {} : { membershipManualEnabled: true },
          ),
        },
        athleteRepository: {
          findContact: vi.fn().mockResolvedValue({ email_verified_at: null }),
          findMembershipPlan: vi.fn().mockResolvedValue({
            code: 'plu-annual', collection_mode: 'one_time', price: DEFAULT_PRICE, manual_price: MANUAL_PRICE,
          }),
          discountCodeManualEligibility: vi.fn().mockResolvedValue(false),
          createMembershipOrder,
        },
      }))
      try {
        const response = await post(target, '/api/athletes/me/membership-orders', membershipBody(paymentMethod))
        expect(response.status).toBe(403)
        expect(await response.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
        expect(createMembershipOrder).not.toHaveBeenCalled()
      } finally {
        await target.close()
      }
    }
  })

  it('exige el perfil competitivo completo para inscribirse, sea cual sea el medio', async () => {
    for (const paymentMethod of ['mercado_pago', 'manual_link', 'cash_pitbull']) {
      const createRegistration = vi.fn()
      const target = listen(createApp({
        env: { PAID_CHECKOUT_ENABLED: 'true' },
        supabaseAdmin: authenticatedSupabase(),
        registrationAccessRepository: { findActiveGate: vi.fn().mockResolvedValue(null), recordUse: vi.fn() },
        platformSettingsRepository: {
          get: vi.fn().mockResolvedValue(
            paymentMethod === 'mercado_pago' ? {} : { registrationManualEnabled: true },
          ),
        },
        athleteRepository: {
          findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
          findCompetitionProfile: vi.fn().mockResolvedValue({ ...COMPLETE_COMPETITION_PROFILE, sex: '' }),
          discountCodeManualEligibility: vi.fn().mockResolvedValue(false),
          createRegistration,
        },
      }))
      try {
        const response = await post(target, '/api/athletes/me/registrations', registrationBody(paymentMethod))
        expect(response.status).toBe(422)
        expect(await response.json()).toMatchObject({ code: 'ATHLETE_PROFILE_INCOMPLETE' })
        expect(createRegistration).not.toHaveBeenCalled()
      } finally {
        await target.close()
      }
    }
  })

  it('no deja cobrar sin sesión de atleta por ningún medio', async () => {
    for (const paymentMethod of ['mercado_pago', 'manual_link', 'cash_pitbull']) {
      const { target, createMembershipOrder } = buildApp({
        toggles: paymentMethod === 'mercado_pago' ? {} : { membershipManualEnabled: true },
      })
      try {
        const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
          method: 'POST',
          headers: mutationHeaders(),
          body: JSON.stringify(membershipBody(paymentMethod)),
        })
        expect(response.status).toBe(401)
        expect(createMembershipOrder).not.toHaveBeenCalled()
      } finally {
        await target.close()
      }
    }
  })
})
