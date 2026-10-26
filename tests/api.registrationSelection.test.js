import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Selección competitiva de la inscripción por HTTP: segunda división (Open al
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
      findEventComboOffer: vi.fn().mockResolvedValue({ price: 120000, manualPrice: 100000 }),
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

describe('inscripción — una sola división', () => {
  it('cobra el 100% y no guarda segunda división', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody())
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          division: 'Junior',
          secondaryDivision: null,
          defaultPrice: EVENT_PRICE,
          manualPrice: EVENT_MANUAL_PRICE,
        }),
      )
    })
  })

  it('quien se anota solo en Open paga el 100%', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ division: 'Open' }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ division: 'Open', secondaryDivision: null, defaultPrice: EVENT_PRICE }),
      )
    })
  })
})

describe('inscripción — segunda división', () => {
  it('Junior + Open: la primera al 100% y Open al 50% sobre cada precio', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ secondaryDivision: 'Open' }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          division: 'Junior',
          secondaryDivision: 'Open',
          defaultPrice: 112500,
          manualPrice: 90000,
        }),
      )
    })
  })

  it('el orden no cambia el cobro: Open primero y Junior segunda es lo mismo', async () => {
    await withApp({}, async (app) => {
      const response = await register(
        app,
        registrationBody({ division: 'Open', secondaryDivision: 'Junior' }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          division: 'Junior',
          secondaryDivision: 'Open',
          defaultPrice: 112500,
        }),
      )
    })
  })

  it('la transferencia suma el 50% sobre el precio manual', async () => {
    await withApp({}, async (app) => {
      const response = await register(
        app,
        registrationBody({ secondaryDivision: 'Open', paymentMethod: 'manual_link' }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          paymentMethod: 'manual_link',
          manualPaymentChannel: 'bank_transfer',
          defaultPrice: 112500,
          manualPrice: 90000,
        }),
      )
    })
  })

  it('Wise cobra el 50% adicional sobre su precio en USD', async () => {
    await withApp({ event: { wise_price: 40 } }, async (app) => {
      const response = await register(
        app,
        registrationBody({ secondaryDivision: 'Open', paymentMethod: 'wise_transfer' }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ defaultPrice: 60, currency: 'USD', manualPrice: null }),
      )
    })
  })

  it('rechaza una segunda división que no corresponde a la edad', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ secondaryDivision: 'Masters' }))
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        code: 'DIVISION_AGE_MISMATCH',
        allowed: ['Junior', 'Open'],
      })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('quien ya compite en Open por edad no puede sumar otra división', async () => {
    await withApp({ birthDate: '1995-01-01' }, async (app) => {
      const response = await register(
        app,
        registrationBody({ division: 'Open', secondaryDivision: 'Junior' }),
      )
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'DIVISION_AGE_MISMATCH' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('un Master puede sumar Open al 50%', async () => {
    await withApp({ birthDate: '1980-01-01' }, async (app) => {
      const response = await register(
        app,
        registrationBody({ division: 'Masters', secondaryDivision: 'Open' }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ division: 'Masters', secondaryDivision: 'Open', defaultPrice: 112500 }),
      )
    })
  })

  it('una división inexistente se corta en la validación del cuerpo', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ secondaryDivision: 'Elite' }))
      expect(response.status).toBe(400)
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })
})

describe('inscripción Submission — categorías múltiples', () => {
  it('dos categorías cobran dos inscripciones y se guardan en la misma orden', async () => {
    await withApp({ event: { slug: 'barbell-submission-2027' } }, async (app) => {
      const response = await register(
        app,
        registrationBody({ categories: ['Raw', 'Single-Ply'] }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          category: 'Raw',
          categories: ['Raw', 'Single-Ply'],
          defaultPrice: EVENT_PRICE * 2,
          manualPrice: EVENT_MANUAL_PRICE * 2,
        }),
      )
    })
  })

  it('un evento común rechaza seleccionar más de una categoría', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ categories: ['Raw', 'Single-Ply'] }))
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'MULTIPLE_CATEGORIES_UNAVAILABLE' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('un evento común inscribe en la categoría elegida, no en la primera del catálogo', async () => {
    await withApp({}, async (app) => {
      const response = await register(
        app,
        registrationBody({ category: 'Single-Ply', categories: ['Single-Ply'] }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          category: 'Single-Ply',
          categories: ['Single-Ply'],
          defaultPrice: EVENT_PRICE,
        }),
      )
    })
  })

  it('rechaza una lista de categorías que no incluye la categoría elegida', async () => {
    await withApp({}, async (app) => {
      // Lo que mandaba un checkout desfasado: eligió Single-Ply y viajaba ["Raw"].
      const response = await register(
        app,
        registrationBody({ category: 'Single-Ply', categories: ['Raw'] }),
      )
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'CATEGORY_MISMATCH' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })
})

describe('inscripción — modalidades', () => {
  it('sin modalidades se rechaza: ya no se da por Full Power sin que nadie la elija', async () => {
    await withApp({}, async (app) => {
      const { modalities: _omit, ...body } = registrationBody()
      const response = await register(app, body)
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'MODALITY_REQUIRED' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('Full Power elegido explícitamente se guarda', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['full_power'] }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ modalities: ['full_power'] }),
      )
    })
  })

  it('Full Power y una más: la extra suma el 50% sobre cada precio', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['bench', 'full_power'] }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          modalities: ['full_power', 'bench'],
          defaultPrice: 112500,
          manualPrice: 90000,
        }),
      )
    })
  })

  it('una modalidad sola, aunque no sea Full Power, paga el 100%', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['bench'] }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ modalities: ['bench'], defaultPrice: EVENT_PRICE }),
      )
    })
  })

  it('Junior + Open + Full Power + Banco: los dos 50% se suman sobre la base', async () => {
    await withApp({}, async (app) => {
      const response = await register(
        app,
        registrationBody({ secondaryDivision: 'Open', modalities: ['full_power', 'bench'] }),
      )
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({
          division: 'Junior',
          secondaryDivision: 'Open',
          defaultPrice: 150000,
          manualPrice: 120000,
        }),
      )
    })
  })

  it('una modalidad parcial sola es válida', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['deadlift'] }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ modalities: ['deadlift'] }),
      )
    })
  })

  it('cualquier combinación de especialidades se guarda en orden canónico', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['deadlift', 'squat', 'bench'] }))
      expect(response.status).toBe(201)
      expect(app.createRegistration).toHaveBeenCalledWith(
        ATHLETE_ID,
        // Tres modalidades: la primera incluida y dos extra al 50%.
        expect.objectContaining({ modalities: ['squat', 'bench', 'deadlift'], defaultPrice: 150000 }),
      )
    })
  })

  it('Push-Pull con banco es redundante y se rechaza', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['push_pull', 'bench'] }))
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'MODALITY_COMBINATION_INVALID' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('una lista vacía se rechaza', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: [] }))
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'MODALITY_REQUIRED' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('una modalidad inexistente se rechaza', async () => {
    await withApp({}, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['rumba'] }))
      expect(response.status).toBe(422)
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })
})

describe('preview de cupón con segunda división', () => {
  it('cotiza el cupón sobre el total con el 50% adicional', async () => {
    await withApp({}, async (app) => {
      const response = await fetch(`${app.target.url}/api/athletes/me/discount-preview`, {
        method: 'POST',
        headers: athleteHeaders(),
        body: JSON.stringify({
          code: 'PLU10',
          appliesTo: 'registration',
          eventSlug: 'pitbull-classic-2026',
          secondaryDivision: 'Open',
        }),
      })
      expect(response.status).toBe(200)
      expect(app.previewDiscountCode).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ baseAmount: 112500 }),
      )
    })
  })

  it('cotiza el cupón sobre el total con las modalidades extra', async () => {
    await withApp({}, async (app) => {
      await fetch(`${app.target.url}/api/athletes/me/discount-preview`, {
        method: 'POST',
        headers: athleteHeaders(),
        body: JSON.stringify({
          code: 'PLU10',
          appliesTo: 'registration',
          eventSlug: 'pitbull-classic-2026',
          secondaryDivision: 'Open',
          modalities: ['full_power', 'bench'],
        }),
      })
      expect(app.previewDiscountCode).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ baseAmount: 150000 }),
      )
    })
  })

  it('el combo suma los recargos cotizados sobre la inscripción suelta', async () => {
    await withApp({}, async (app) => {
      await fetch(`${app.target.url}/api/athletes/me/discount-preview`, {
        method: 'POST',
        headers: athleteHeaders(),
        body: JSON.stringify({
          code: 'PLU10',
          appliesTo: 'combo',
          eventSlug: 'pitbull-classic-2026',
          secondaryDivision: 'Open',
          modalities: ['full_power', 'bench'],
        }),
      })
      // Paquete 120.000 + Open 37.500 + Banco 37.500 (50% de la inscripción suelta).
      expect(app.previewDiscountCode).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ baseAmount: 195000 }),
      )
    })
  })

  it('sin segunda división cotiza sobre el precio de lista', async () => {
    await withApp({}, async (app) => {
      await fetch(`${app.target.url}/api/athletes/me/discount-preview`, {
        method: 'POST',
        headers: athleteHeaders(),
        body: JSON.stringify({
          code: 'PLU10',
          appliesTo: 'registration',
          eventSlug: 'pitbull-classic-2026',
        }),
      })
      expect(app.previewDiscountCode).toHaveBeenCalledWith(
        ATHLETE_ID,
        expect.objectContaining({ baseAmount: EVENT_PRICE }),
      )
    })
  })
})

describe('inscripción — lo que ofrece el evento', () => {
  const offering = {
    categories: ['Raw'],
    divisions: ['Junior', 'Open'],
    modalities: ['full_power', 'bench'],
  }

  it('acepta lo que el evento ofrece', async () => {
    await withApp({ event: { rules: { offering } } }, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['full_power', 'bench'] }))
      expect(response.status).toBe(201)
    })
  })

  it('rechaza una categoría de competencia que el evento no ofrece', async () => {
    await withApp({ event: { rules: { offering } } }, async (app) => {
      const response = await register(app, registrationBody({ category: 'Single-Ply' }))
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'OFFERING_CATEGORY_UNAVAILABLE' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('rechaza una modalidad que el evento no ofrece', async () => {
    await withApp({ event: { rules: { offering } } }, async (app) => {
      const response = await register(app, registrationBody({ modalities: ['squat'] }))
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'OFFERING_MODALITY_UNAVAILABLE' })
      expect(app.createRegistration).not.toHaveBeenCalled()
    })
  })

  it('rechaza una división que el evento no ofrece, aunque corresponda a la edad', async () => {
    await withApp(
      { birthDate: '1980-01-01', event: { rules: { offering } } },
      async (app) => {
        const response = await register(app, registrationBody({ division: 'Masters' }))
        expect(response.status).toBe(422)
        expect(await response.json()).toMatchObject({ code: 'OFFERING_DIVISION_UNAVAILABLE' })
        expect(app.createRegistration).not.toHaveBeenCalled()
      },
    )
  })

  it('un evento sin oferta configurada ofrece todo', async () => {
    await withApp({ event: { rules: {} } }, async (app) => {
      const response = await register(app, registrationBody({ category: 'Unlimited', modalities: ['squat'] }))
      expect(response.status).toBe(201)
    })
  })
})
