import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
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
    if (name === 'staff_get_promotion_campaign_analytics') {
      return { data: [], error: null }
    }
    if (name === 'staff_simulate_promotion_code') {
      return {
        data: {
          status: 'ready',
          code: 'ONLY-PITBULL',
          destination: { kind: 'account_offer' },
          checks: { active: true },
        },
        error: null,
      }
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
        campaignAnalytics: [],
        availability: { editable: true, reason: null },
      })
      expect(rpc).toHaveBeenCalledWith('staff_get_pricing_configuration', {})
    } finally {
      await target.close()
    }
  })

  it('simula el recorrido de un código sin canjearlo ni consumir cupo', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(
        `${target.url}/api/pricing/discount-codes/${PLAN_ID}/simulation`,
        { headers: { Cookie: cookie } },
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        simulation: expect.objectContaining({
          status: 'ready',
          code: 'ONLY-PITBULL',
        }),
      })
      expect(rpc).toHaveBeenCalledWith('staff_simulate_promotion_code', {
        p_code_id: PLAN_ID,
      })
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
  })

  it('cambia el precio de inscripción de un torneo, ahora o programado', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(
        `${target.url}/api/pricing/events/pitbull-classic/registration-price`,
        {
          method: 'PATCH',
          headers: authHeaders(cookie),
          body: JSON.stringify({
            price: 52000,
            manualPrice: 50000,
            effectiveAt: '2026-09-01T03:00:00Z',
          }),
        },
      )
      expect(response.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('staff_set_event_registration_price', {
        p_event_slug: 'pitbull-classic',
        p_price: 52000,
        p_manual_price: 50000,
        p_effective_at: '2026-09-01T03:00:00Z',
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('sin precio manual ni fecha, el cambio viaja inmediato y de un solo canal', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(
        `${target.url}/api/pricing/events/pitbull-classic/registration-price`,
        {
          method: 'PATCH',
          headers: authHeaders(cookie),
          body: JSON.stringify({ price: 52000 }),
        },
      )
      expect(response.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('staff_set_event_registration_price', {
        p_event_slug: 'pitbull-classic',
        p_price: 52000,
        p_manual_price: null,
        p_effective_at: null,
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza un precio de inscripción inválido antes de tocar la base', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(
        `${target.url}/api/pricing/events/pitbull-classic/registration-price`,
        {
          method: 'PATCH',
          headers: authHeaders(cookie),
          body: JSON.stringify({ price: 0 }),
        },
      )
      expect(response.status).toBe(400)
      expect(rpc).not.toHaveBeenCalledWith(
        'staff_set_event_registration_price',
        expect.anything(),
      )
    } finally {
      await target.close()
    }
  })

  it('cancela el cambio de precio programado de un torneo', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(
        `${target.url}/api/pricing/events/pitbull-classic/registration-price/schedule`,
        { method: 'DELETE', headers: authHeaders(cookie) },
      )
      expect(response.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('staff_clear_event_registration_price_schedule', {
        p_event_slug: 'pitbull-classic',
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
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
        // El combo se arma contra una inscripción concreta: es de donde salen
        // el precio de lista de esa parte y la llave que canjea el atleta
        // (20260918100000).
        eventId: '11111111-2222-4333-8444-555555555555',
        percentOff: 25,
      }),
    )

    expect(parsed.success).toBe(true)
    expect(parsed.data.fixedPrice).toBe(120000)
    expect(parsed.data.eventId).toBe('11111111-2222-4333-8444-555555555555')
    // El porcentaje viaja en el payload pero no llega a la base: cada
    // modalidad guarda sólo su propio campo.
    expect(parsed.data.percentOff).toBeUndefined()
  })

  it('rechaza una promo de precio fijo sin importe o con alcance combinado', () => {
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({
          kind: 'fixed_price',
          appliesTo: 'combo',
          eventId: '11111111-2222-4333-8444-555555555555',
          percentOff: undefined,
        }),
      ).success,
    ).toBe(false)
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ kind: 'fixed_price', fixedPrice: 120000, appliesTo: 'both' }),
      ).success,
    ).toBe(false)
  })

  // Un combo sin inscripción se guardaba y después no se podía canjear por
  // ningún camino: `plu_private.athlete_unlocked_offer_code` busca la llave
  // del atleta por evento. Ver la cabecera de 20260918100000.
  it('rechaza un combo sin inscripción o repartido como promo pública', () => {
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ kind: 'fixed_price', fixedPrice: 120000, appliesTo: 'combo' }),
      ).success,
    ).toBe(false)
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({
          kind: 'fixed_price',
          fixedPrice: 120000,
          appliesTo: 'combo',
          eventId: '11111111-2222-4333-8444-555555555555',
          audience: 'public',
        }),
      ).success,
    ).toBe(false)
  })

  // El séptimo dato del paquete —qué afiliación se empaqueta— es el único que
  // el código no podía deducir, y por eso antes había que cargar el combo del
  // evento primero.
  it('acepta la afiliación que empaqueta el combo', () => {
    const planId = '99999999-8888-4777-8666-555555555555'
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        kind: 'fixed_price',
        fixedPrice: 120000,
        appliesTo: 'combo',
        eventId: '11111111-2222-4333-8444-555555555555',
        membershipPlanId: planId,
      }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.membershipPlanId).toBe(planId)
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

  // Una promoción sin audiencia declarada es una promoción por código: es lo
  // que significaba cada cupón antes de que la audiencia existiera, y un
  // payload viejo no puede volverse público por omisión.
  it('deja las promociones en restringida por código salvo que se pida lo contrario', () => {
    const parsed = discountCodeSchema.safeParse(discountCodePayload())
    expect(parsed.success).toBe(true)
    expect(parsed.data.audience).toBe('code')
  })

  it('acepta una promoción pública', () => {
    const parsed = discountCodeSchema.safeParse(discountCodePayload({ audience: 'public' }))
    expect(parsed.success).toBe(true)
    expect(parsed.data.audience).toBe('public')
  })

  it('acepta el mismo precio promocional en Mercado Pago y en el canal manual', () => {
    // El pedido explícito: si el precio pactado por Mercado Pago es $120.000,
    // el de transferencia o efectivo puede ser el mismo. No tiene que ser menor.
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        kind: 'fixed_price',
        percentOff: undefined,
        fixedPrice: 120000,
        fixedPriceManual: 120000,
        appliesTo: 'membership',
      }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.fixedPrice).toBe(120000)
    expect(parsed.data.fixedPriceManual).toBe(120000)
  })

  it('acepta también un precio manual mayor que el de Mercado Pago', () => {
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        kind: 'fixed_price',
        percentOff: undefined,
        fixedPrice: 120000,
        fixedPriceManual: 135000,
        appliesTo: 'registration',
      }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.fixedPriceManual).toBe(135000)
  })

  it('descarta el precio manual en una promoción por porcentaje', () => {
    // Un porcentaje ya se aplica sobre el precio de cada canal: un importe fijo
    // manual acá no significa nada, así que se rechaza en vez de guardarse
    // silenciosamente contra una modalidad que no lo usa.
    expect(
      discountCodeSchema.safeParse(discountCodePayload({ fixedPriceManual: 90000 })).success,
    ).toBe(false)
    const parsed = discountCodeSchema.safeParse(discountCodePayload())
    expect(parsed.success).toBe(true)
    expect(parsed.data.fixedPriceManual).toBeUndefined()
  })

  it('rechaza una ventana que cierra antes de abrir', () => {
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({
          startsAt: '2026-09-10T00:00:00.000Z',
          expiresAt: '2026-09-01T00:00:00.000Z',
        }),
      ).success,
    ).toBe(false)
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        startsAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-09-30T00:00:00.000Z',
      }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.startsAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('una promoción sin apertura queda vigente desde que se enciende', () => {
    const parsed = discountCodeSchema.safeParse(discountCodePayload())
    expect(parsed.success).toBe(true)
    expect(parsed.data.startsAt).toBe('')
  })

  it('normaliza la lista de invitados y rechaza direcciones inválidas', () => {
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({ invitees: ['Ana@PLU.ar', 'bruno@plu.ar', 'ana@plu.ar'] }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.invitees).toEqual(['ana@plu.ar', 'bruno@plu.ar'])

    expect(
      discountCodeSchema.safeParse(discountCodePayload({ invitees: ['no-es-un-mail'] })).success,
    ).toBe(false)
  })

  it('sin invitados la promoción queda abierta', () => {
    const parsed = discountCodeSchema.safeParse(discountCodePayload())
    expect(parsed.success).toBe(true)
    expect(parsed.data.invitees).toEqual([])
  })

  it('una promoción pública también puede ser exclusiva de una lista', () => {
    // Los dos ejes son ortogonales: se aplica sola, pero sólo a los invitados.
    // No es lo mismo que abrir un canal manual, que sí está prohibido en pública.
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({ audience: 'public', invitees: ['ana@plu.ar'] }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.invitees).toEqual(['ana@plu.ar'])
  })

  it('no deja que una promoción pública abra medios de pago manuales', () => {
    // Abrir un canal para todo el mundo es el interruptor de Acceso y
    // habilitación. Permitirlo acá sería el mismo control en dos pantallas.
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ audience: 'public', manualChannels: ['bank_transfer'] }),
      ).success,
    ).toBe(false)
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ audience: 'code', manualChannels: ['bank_transfer'] }),
      ).success,
    ).toBe(true)
  })

  it('deja cerrar Mercado Pago para un código restringido', () => {
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        audience: 'code',
        mercadoPagoEnabled: false,
        manualChannels: ['cash_pitbull'],
      }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.mercadoPagoEnabled).toBe(false)
  })

  it('la pasarela queda abierta si el payload no dice nada', () => {
    // Comportamiento histórico: es lo que valía para todos los códigos antes de
    // 20260908100000, y lo que manda un panel desplegado sin el campo.
    const parsed = discountCodeSchema.safeParse(discountCodePayload())
    expect(parsed.success).toBe(true)
    expect(parsed.data.mercadoPagoEnabled).toBe(true)
  })

  it('no deja un código sin ningún medio de pago', () => {
    // Se canjea y no hay forma de pagarlo. Mismo check en la RPC y en el
    // constraint discount_codes_any_channel_check.
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ mercadoPagoEnabled: false, manualChannels: [] }),
      ).success,
    ).toBe(false)
  })

  it('no deja que una promoción pública cierre Mercado Pago', () => {
    // Se aplica sola a todas las compras: cerrarle la pasarela desde acá sería
    // cerrar el checkout entero desde la pantalla de precios.
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({ audience: 'public', mercadoPagoEnabled: false }),
      ).success,
    ).toBe(false)
  })

  it('deja financiar un código restringido con canal manual declarado', () => {
    const parsed = discountCodeSchema.safeParse(
      discountCodePayload({
        audience: 'code',
        financed: true,
        manualChannels: ['bank_transfer', 'cash_pitbull'],
      }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.financed).toBe(true)
  })

  it('nace sin financiamiento si el payload no dice nada', () => {
    const parsed = discountCodeSchema.safeParse(discountCodePayload())
    expect(parsed.success).toBe(true)
    expect(parsed.data.financed).toBe(false)
  })

  it('no deja financiar sin un canal que el atleta pueda declarar', () => {
    // Financiado + sólo Mercado Pago es el interruptor inerte: la pasarela
    // acredita sola y no hay nada que avisar. Mismo check en la RPC y en el
    // constraint discount_codes_financed_channel_check.
    expect(
      discountCodeSchema.safeParse(discountCodePayload({ financed: true, manualChannels: [] }))
        .success,
    ).toBe(false)
  })

  it('no deja que una promoción pública financie', () => {
    // Se aplica sola a todas las compras: financiarla sería abrir deuda para
    // cualquiera que pase por el checkout.
    expect(
      discountCodeSchema.safeParse(
        discountCodePayload({
          audience: 'public',
          financed: true,
          manualChannels: ['bank_transfer'],
        }),
      ).success,
    ).toBe(false)
  })

  it('cambia estado y audiencia de una promoción en una sola llamada', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/pricing/discount-codes/${PLAN_ID}/state`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ active: true, audience: 'public' }),
      })

      expect(response.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('staff_set_discount_code_state', {
        p_code_id: PLAN_ID,
        p_active: true,
        p_audience: 'public',
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('conserva /status y ahí la audiencia no se toca', async () => {
    const { cookie, rpc, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/pricing/discount-codes/${PLAN_ID}/status`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ active: false }),
      })

      expect(response.status).toBe(200)
      // `p_audience` nulo: apagar una promo no puede convertirla en pública
      // cuando se la vuelva a prender.
      expect(rpc).toHaveBeenCalledWith('staff_set_discount_code_state', {
        p_code_id: PLAN_ID,
        p_active: false,
        p_audience: null,
        p_actor: expect.stringContaining('pricing-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('ya no expone la oferta combo como objeto aparte', async () => {
    // El paquete se carga entero dentro del código: no hay endpoint que pueda
    // volver a partir la configuración en dos objetos.
    const { cookie, rpc, target } = await setup()
    try {
      for (const method of ['PUT', 'DELETE']) {
        const response = await fetch(
          `${target.url}/api/pricing/events/pitbull-classic-2026/combo`,
          { method, headers: authHeaders(cookie), body: method === 'PUT' ? '{}' : undefined },
        )
        expect(response.status, method).toBe(404)
      }
      expect(rpc).not.toHaveBeenCalledWith(
        'staff_save_event_combo_offer',
        expect.anything(),
      )
    } finally {
      await target.close()
    }
  })
})
