import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const athleteHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
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

function buildApp(comboOffer) {
  return listen(
    createApp({
      env: {},
      supabaseAdmin: authenticatedSupabase(),
      athleteRepository: {
        findEventComboOffer: vi.fn().mockResolvedValue(comboOffer),
      },
    }),
  )
}

const RESTRICTED = {
  price: 120000,
  manualPrice: null,
  currency: 'ARS',
  audience: 'code',
  accessCode: 'COMBO-PITBULL',
}

// El código del combo no viaja en ningún payload público (ver
// CATALOG_EVENT_SELECT en server/routes/events.js), así que el checkout no
// puede validarlo solo: este endpoint es el que le permite decir "código
// incorrecto" antes de que el atleta cargue todo el formulario.
describe('POST /me/combo-access/verify', () => {
  it('destraba el combo con el código correcto, sin importar espacios ni mayúsculas', async () => {
    const target = buildApp(RESTRICTED)
    try {
      const response = await fetch(`${target.url}/api/athletes/me/combo-access/verify`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ eventSlug: 'pitbull-classic-2026', code: ' combo-pitbull ' }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ valid: true, required: true })
    } finally {
      await target.close()
    }
  })

  it('rechaza un código que no es el del combo', async () => {
    const target = buildApp(RESTRICTED)
    try {
      const response = await fetch(`${target.url}/api/athletes/me/combo-access/verify`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ eventSlug: 'pitbull-classic-2026', code: 'OTRO' }),
      })

      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('COMBO_ACCESS_CODE_INVALID')
    } finally {
      await target.close()
    }
  })

  // Un combo que dejó de ser restringido entre que se pintó la pantalla y se
  // mandó el código no tiene nada que desbloquear: sigue disponible.
  it('no falla si el combo volvió a ser público', async () => {
    const target = buildApp({ ...RESTRICTED, audience: 'public', accessCode: null })
    try {
      const response = await fetch(`${target.url}/api/athletes/me/combo-access/verify`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ eventSlug: 'pitbull-classic-2026', code: 'CUALQUIERA' }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ valid: true, required: false })
    } finally {
      await target.close()
    }
  })

  it('devuelve 404 si el evento no tiene combo vigente', async () => {
    const target = buildApp(null)
    try {
      const response = await fetch(`${target.url}/api/athletes/me/combo-access/verify`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify({ eventSlug: 'sin-combo', code: 'COMBO-PITBULL' }),
      })

      expect(response.status).toBe(404)
    } finally {
      await target.close()
    }
  })
})

// Destrabar el paquete en pantalla no alcanza para comprarlo: el alta de la
// orden vuelve a exigir el mismo código. Sin esto, cualquiera que supiera que
// el combo existe podría postear el checkout y llevarse el precio cerrado.
describe('POST /me/registration-combos con combo restringido', () => {
  function buildCheckoutApp(comboOffer, { previewDiscountCode } = {}) {
    const createRegistrationCombo = vi.fn().mockResolvedValue({ order: { id: 'order-combo' } })
    const target = listen(
      createApp({
        env: { PAID_CHECKOUT_ENABLED: 'true' },
        supabaseAdmin: authenticatedSupabase(),
        registrationAccessRepository: {
          findActiveGate: vi.fn().mockResolvedValue(null),
          recordUse: vi.fn(),
        },
        platformSettingsRepository: { get: vi.fn().mockResolvedValue({}) },
        athleteRepository: {
          findContact: vi.fn().mockResolvedValue({ email_verified_at: '2026-08-01T00:00:00Z' }),
          findCompetitionProfile: vi.fn().mockResolvedValue({
            full_name: 'Atleta de Prueba',
            birth_date: '1995-01-01',
            sex: 'Masculino',
            gym: 'Test Gym',
            phone: '1122334455',
            country: 'Argentina',
            province: 'Buenos Aires',
          }),
          findEventPricing: vi.fn().mockResolvedValue({
            price: 85000,
            manual_price: null,
            payment_channel_overrides: null,
          }),
          findEventComboOffer: vi.fn().mockResolvedValue(comboOffer),
          discountCodeManualEligibility: vi.fn().mockResolvedValue(false),
          previewDiscountCode:
            previewDiscountCode ?? vi.fn().mockResolvedValue({ valid: false, reason: 'not_found' }),
          createRegistrationCombo,
        },
      }),
    )
    return { target, createRegistrationCombo }
  }

  function comboBody(extra = {}) {
    return {
      eventSlug: 'pitbull-classic-2026',
      division: 'Open',
      category: 'Raw',
      bodyweightKg: 90,
      paymentMethod: 'mercado_pago',
      idempotencyKey: crypto.randomUUID(),
      ...extra,
    }
  }

  it('no crea la orden sin el código', async () => {
    const { target, createRegistrationCombo } = buildCheckoutApp(RESTRICTED)
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody()),
      })

      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('COMBO_ACCESS_CODE_REQUIRED')
      expect(createRegistrationCombo).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('no crea la orden con un código equivocado', async () => {
    const { target, createRegistrationCombo } = buildCheckoutApp(RESTRICTED)
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody({ comboAccessCode: 'OTRO' })),
      })

      expect(response.status).toBe(403)
      expect(createRegistrationCombo).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('crea la orden con el código correcto', async () => {
    const { target, createRegistrationCombo } = buildCheckoutApp(RESTRICTED)
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody({ comboAccessCode: 'combo-pitbull' })),
      })

      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)
      expect(createRegistrationCombo).toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('un combo público sigue comprándose sin código', async () => {
    const { target, createRegistrationCombo } = buildCheckoutApp({
      ...RESTRICTED,
      audience: 'public',
      accessCode: null,
    })
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody()),
      })

      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)
      expect(createRegistrationCombo).toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  // Un discount_code kind='access' es una prueba de acceso tan válida como el
  // access_code del evento (20260901100000_discount_code_access_kind.sql):
  // el atleta puede pegarlo en el campo de descuento en vez del de acceso.
  it('desbloquea el combo con un discount code kind=access, sin comboAccessCode', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'access' })
    const { target, createRegistrationCombo } = buildCheckoutApp(RESTRICTED, {
      previewDiscountCode,
    })
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody({ discountCode: 'COMBO-SECRETO' })),
      })

      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)
      expect(createRegistrationCombo).toHaveBeenCalled()
      expect(previewDiscountCode).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        expect.objectContaining({ code: 'COMBO-SECRETO', appliesTo: 'combo' }),
      )
    } finally {
      await target.close()
    }
  })

  it('también acepta el discount code kind=access pegado en comboAccessCode', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'access' })
    const { target, createRegistrationCombo } = buildCheckoutApp(RESTRICTED, {
      previewDiscountCode,
    })
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody({ comboAccessCode: 'COMBO-SECRETO' })),
      })

      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)
      expect(createRegistrationCombo).toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  // Un cupón de descuento normal (kind='percent'/'fixed_price') no es una
  // prueba de acceso: no debe destrabar el combo sólo porque sea válido.
  it('no desbloquea el combo con un discount code que no es kind=access', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'percent' })
    const { target, createRegistrationCombo } = buildCheckoutApp(RESTRICTED, {
      previewDiscountCode,
    })
    try {
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: athleteHeaders,
        body: JSON.stringify(comboBody({ discountCode: 'DESCUENTO10' })),
      })

      expect(response.status).toBe(403)
      expect(createRegistrationCombo).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})
