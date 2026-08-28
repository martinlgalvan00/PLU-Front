import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Códigos de descuento y promoción contra Supabase.
 *
 * La suite existía sólo a nivel de esquema, y por eso pasó inadvertido que
 * `settle_manual_checkout_pricing` reescribía `amount` con el precio de lista
 * después de que el cupón ya lo había bajado: la orden guardaba el canje y
 * cobraba el total. Estos tests miran el importe final de la orden, que es lo
 * único que termina en Mercado Pago.
 */

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('códigos de descuento y promoción en el checkout', () => {
  const admin = createSupabaseTestClient()
  const createdAthleteIds = []
  const createdEventIds = []
  const createdCodeIds = []

  const listenTarget = listen(
    createApp({
      supabaseAdmin: admin,
      notifyPaymentApplied: async () => {},
      // El combo manual exige los dos canales abiertos; en la base compartida
      // están cerrados porque el lanzamiento va sólo con Mercado Pago.
      platformSettingsRepository: manualChannelsOpen(),
      env: {
        ...process.env,
        APP_PRODUCTION: 'false',
        PAYMENTS_MOCK: 'true',
        PAID_CHECKOUT_ENABLED: 'true',
        AUTH_SECRET: process.env.AUTH_SECRET,
      },
    }),
  )

  async function activePlan() {
    const nowIso = new Date().toISOString()
    const result = await admin
      .from('membership_plans')
      .select('*')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .lte('effective_from', nowIso)
      .or(`retired_at.is.null,retired_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle()
    if (result.error || !result.data) {
      throw new Error(`Falta un plan one_time activo para el test: ${result.error?.message ?? ''}`)
    }
    return result.data
  }

  async function createDiscountCode(code) {
    const result = await admin.rpc('staff_upsert_discount_code', {
      p_code: code,
      p_actor: 'integration-test',
    })
    if (result.error) throw new Error(result.error.message)
    createdCodeIds.push(result.data.id)
    return result.data
  }

  async function registerAthlete(prefix) {
    const suffix = randomUUID()
    const response = await fetch(`${listenTarget.url}/api/athletes/register`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({
        fullName: `Promo Athlete ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email: `${prefix}-${suffix}@pluarg.test`,
        birthDate: '1995-01-01',
        phone: '1122334455',
        country: 'Argentina',
        province: 'Buenos Aires',
        city: 'CABA',
        gym: 'Test Gym',
        sex: 'Masculino',
        division: 'Open',
        category: 'Raw',
        estimatedWeight: 90,
        password: 'integration-test-password-athlete',
      }),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)
    createdAthleteIds.push(body.athlete.id)
    await admin
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', body.athlete.id)
    return { athlete: body.athlete, cookie: sessionCookie(response) }
  }

  async function createEventWithCombo(plan, { comboPrice }) {
    const slug = `promo-integration-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Promo integration test',
        description: 'Fixture de cupones',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 4,
        status: 'inscripcion_abierta',
        published: true,
        requires_membership: true,
        price: 45000,
        currency: plan.currency,
      })
      .select()
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)
    createdEventIds.push(eventResult.data.id)

    const offerResult = await admin.from('event_combo_offers').insert({
      organization_id: plan.organization_id,
      event_id: eventResult.data.id,
      membership_plan_id: plan.id,
      price: comboPrice,
      currency: plan.currency,
      active: true,
    })
    if (offerResult.error) throw new Error(offerResult.error.message)
    return { slug, event: eventResult.data }
  }

  afterAll(async () => {
    const cleanup = async (operation, label) => {
      const result = await operation
      if (result.error) throw new Error(`Cleanup ${label}: ${result.error.message}`)
      return result.data ?? []
    }

    let orderIds = []
    if (createdAthleteIds.length) {
      const orders = await cleanup(
        admin.from('athlete_payment_orders').select('id').in('athlete_id', createdAthleteIds),
        'ordenes',
      )
      orderIds = orders.map((row) => row.id)
      if (orderIds.length) {
        await cleanup(
          admin.from('embedded_payment_attempts').delete().in('order_id', orderIds),
          'intentos de pago',
        )
      }
      for (const athleteId of createdAthleteIds) {
        await cleanup(
          admin.rpc('delete_athlete', {
            p_athlete_id: athleteId,
            p_actor: 'integration-test-cleanup',
          }),
          `atleta ${athleteId}`,
        )
      }
    }
    if (createdEventIds.length) {
      await cleanup(
        admin.from('event_combo_offers').delete().in('event_id', createdEventIds),
        'ofertas combo',
      )
      await cleanup(admin.from('events').delete().in('id', createdEventIds), 'eventos')
    }
    // Los canjes caen con el atleta (on delete cascade); el cupón se borra
    // recién después para que ese cascade ya haya pasado.
    if (createdCodeIds.length) {
      await cleanup(
        admin.from('discount_code_redemptions').delete().in('discount_code_id', createdCodeIds),
        'canjes',
      )
      await cleanup(admin.from('discount_codes').delete().in('id', createdCodeIds), 'cupones')
    }

    const entityIds = [...createdAthleteIds, ...createdEventIds, ...orderIds, ...createdCodeIds]
    await cleanup(
      admin.from('transactional_email_logs').delete().like('recipient_email', 'promo-%@pluarg.test'),
      'emails de fixture',
    )
    if (createdAthleteIds.length) {
      await cleanup(
        admin.from('domain_audit_logs').delete().in('actor_id', createdAthleteIds),
        'auditoria por actor',
      )
      await cleanup(
        admin.from('operational_event_logs').delete().in('actor_id', createdAthleteIds),
        'eventos operativos por actor',
      )
    }
    if (entityIds.length) {
      await cleanup(
        admin.from('domain_audit_logs').delete().in('entity_id', entityIds),
        'auditoria por entidad',
      )
      await cleanup(
        admin.from('operational_event_logs').delete().in('entity_id', entityIds),
        'eventos operativos por entidad',
      )
    }
    await listenTarget.close()
  })

  it('cobra la afiliación con el descuento aplicado, no el precio de lista', async () => {
    const plan = await activePlan()
    const code = `TEST-PCT-${randomBytes(3).toString('hex').toUpperCase()}`
    await createDiscountCode({
      organizationId: plan.organization_id,
      code,
      percentOff: 20,
      appliesTo: 'membership',
      active: true,
    })

    const { athlete, cookie } = await registerAthlete('promo')
    const response = await fetch(`${listenTarget.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        paymentMethod: 'mercado_pago',
        planCode: plan.code,
        idempotencyKey: randomUUID(),
        discountCode: code,
      }),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)

    const expected = plan.price - Math.floor((plan.price * 20) / 100)
    expect(body.order.discount_code).toBe(code)
    expect(body.order.amount).toBe(expected)

    // Lo que quedó en la base es lo que se le va a cobrar: la respuesta del
    // POST podría estar bien y la fila mal, que es exactamente lo que pasaba.
    const stored = await admin
      .from('athlete_payment_orders')
      .select('amount, discount_amount, discount_code')
      .eq('athlete_id', athlete.id)
      .maybeSingle()
    if (stored.error) throw new Error(stored.error.message)
    expect(stored.data.amount).toBe(expected)
    expect(stored.data.discount_amount).toBe(plan.price - expected)
  })

  it('deja el combo en el precio promocional exacto del código', async () => {
    const plan = await activePlan()
    const comboPrice = plan.price + 45000
    const promoPrice = Math.max(1, comboPrice - 20000)
    const { slug, event: comboEvent } = await createEventWithCombo(plan, { comboPrice })
    const code = `TEST-FIX-${randomBytes(3).toString('hex').toUpperCase()}`
    await createDiscountCode({
      organizationId: plan.organization_id,
      code,
      kind: 'fixed_price',
      fixedPrice: promoPrice,
      appliesTo: 'combo',
      // Un precio promocional con alcance combo ES el paquete y se arma
      // contra UNA inscripcion (20260918100000): la RPC y el schema de
      // Express lo exigen, porque sin evento no se puede canjear.
      eventId: comboEvent.id,
      active: true,
      manualChannels: ['bank_transfer', 'cash_pitbull'],
    })

    const { cookie } = await registerAthlete('promo')
    const response = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        eventSlug: slug,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
        discountCode: code,
      }),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)

    // El punto de una promo de precio fijo: se paga ese número, no un
    // porcentaje calculado sobre el precio de lista.
    expect(body.order.amount).toBe(promoPrice)
    expect(body.order.discount_amount).toBe(comboPrice - promoPrice)
    expect(body.order.discount_code).toBe(code)
  })

  it('previsualiza el precio promocional del combo antes de crear la orden', async () => {
    const plan = await activePlan()
    const comboPrice = plan.price + 45000
    const promoPrice = Math.max(1, comboPrice - 15000)
    const { slug, event: comboEvent } = await createEventWithCombo(plan, { comboPrice })
    const code = `TEST-PRV-${randomBytes(3).toString('hex').toUpperCase()}`
    await createDiscountCode({
      organizationId: plan.organization_id,
      code,
      kind: 'fixed_price',
      fixedPrice: promoPrice,
      appliesTo: 'combo',
      // Un precio promocional con alcance combo ES el paquete y se arma
      // contra UNA inscripcion (20260918100000): la RPC y el schema de
      // Express lo exigen, porque sin evento no se puede canjear.
      eventId: comboEvent.id,
      active: true,
    })

    const { cookie } = await registerAthlete('promo')
    const response = await fetch(`${listenTarget.url}/api/athletes/me/discount-preview`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        code,
        appliesTo: 'combo',
        eventSlug: slug,
        paymentMethod: 'mercado_pago',
      }),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.preview.valid).toBe(true)
    expect(body.preview.kind).toBe('fixed_price')
    expect(body.preview.finalAmount).toBe(promoPrice)
    expect(body.preview.discountAmount).toBe(comboPrice - promoPrice)
  })

  it('rechaza un código de afiliación usado en una inscripción', async () => {
    const plan = await activePlan()
    const comboPrice = plan.price + 45000
    const { slug } = await createEventWithCombo(plan, { comboPrice })
    const code = `TEST-SCP-${randomBytes(3).toString('hex').toUpperCase()}`
    await createDiscountCode({
      organizationId: plan.organization_id,
      code,
      percentOff: 30,
      appliesTo: 'membership',
      active: true,
    })

    const { cookie } = await registerAthlete('promo')
    const response = await fetch(`${listenTarget.url}/api/athletes/me/discount-preview`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({ code, appliesTo: 'registration', eventSlug: slug }),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.preview.valid).toBe(false)
    expect(body.preview.reason).toBe('not_applicable')
  })

  it('no aplica un precio promocional que no mejore lo que ya cuesta', async () => {
    const plan = await activePlan()
    const code = `TEST-HIG-${randomBytes(3).toString('hex').toUpperCase()}`
    await createDiscountCode({
      organizationId: plan.organization_id,
      code,
      kind: 'fixed_price',
      fixedPrice: plan.price + 10000,
      appliesTo: 'membership',
      active: true,
    })

    const { cookie } = await registerAthlete('promo')
    const preview = await fetch(`${listenTarget.url}/api/athletes/me/discount-preview`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({ code, appliesTo: 'membership', planCode: plan.code }),
    })
    const previewBody = await preview.json()
    expect(preview.status, JSON.stringify(previewBody)).toBe(200)
    expect(previewBody.preview.valid).toBe(false)
    expect(previewBody.preview.reason).toBe('no_savings')

    // Y si igual se manda al checkout, el canje falla con un conflicto legible
    // en vez del 503 genérico que devolvía el mapeo anterior de errcodes.
    const order = await fetch(`${listenTarget.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        paymentMethod: 'mercado_pago',
        planCode: plan.code,
        idempotencyKey: randomUUID(),
        discountCode: code,
      }),
    })
    const orderBody = await order.json()
    expect(order.status, JSON.stringify(orderBody)).toBe(409)
  })

  it('destraba transferencia sólo para quien usa el código, con el canal cerrado', async () => {
    // Estado real del lanzamiento: afiliación e inscripción se pagan
    // únicamente con Mercado Pago. Un código marcado como `enablesManualPayment`
    // tiene que abrir transferencia/efectivo para esa compra puntual, sin tocar
    // el interruptor general.
    const closedChannels = listen(
      createApp({
        supabaseAdmin: admin,
        notifyPaymentApplied: async () => {},
        platformSettingsRepository: {
          get: async () => ({
            membershipManualEnabled: false,
            registrationManualEnabled: false,
          }),
        },
        env: {
          ...process.env,
          APP_PRODUCTION: 'false',
          PAYMENTS_MOCK: 'true',
          PAID_CHECKOUT_ENABLED: 'true',
          AUTH_SECRET: process.env.AUTH_SECRET,
        },
      }),
    )

    try {
      const plan = await activePlan()
      const comboPrice = plan.price + 45000
      const promoPrice = 120000
      const { slug, event: comboEvent } = await createEventWithCombo(plan, { comboPrice })
      const code = `TEST-CASH-${randomBytes(3).toString('hex').toUpperCase()}`
      await createDiscountCode({
        organizationId: plan.organization_id,
        code,
        kind: 'fixed_price',
        fixedPrice: promoPrice,
        appliesTo: 'combo',
        // Un precio promocional con alcance combo ES el paquete y se arma
        // contra UNA inscripcion (20260918100000): la RPC y el schema de
        // Express lo exigen, porque sin evento no se puede canjear.
        eventId: comboEvent.id,
        active: true,
        manualChannels: ['bank_transfer'],
      })

      const comboBody = (cookie, body) =>
        fetch(`${closedChannels.url}/api/athletes/me/registration-combos`, {
          method: 'POST',
          headers: { ...mutationHeaders, Cookie: cookie },
          body: JSON.stringify({
            eventSlug: slug,
            division: 'Open',
            category: 'Raw',
            bodyweightKg: 90,
            paymentMethod: 'manual_link',
            idempotencyKey: randomUUID(),
            ...body,
          }),
        })

      // Sin el código, transferencia sigue cerrada.
      const { cookie: plainCookie } = await registerAthlete('promo')
      const blocked = await comboBody(plainCookie, {})
      expect(blocked.status).toBe(409)

      // Con el código, la misma compra pasa y queda en el precio promocional.
      const { cookie } = await registerAthlete('promo')
      const allowed = await comboBody(cookie, { discountCode: code })
      const allowedBody = await allowed.json()
      expect(allowed.status, JSON.stringify(allowedBody)).toBe(201)
      expect(allowedBody.order.amount).toBe(promoPrice)
      expect(allowedBody.order.method).toBe('manual_link')
      expect(allowedBody.order.manual_payment_channel).toBe('bank_transfer')
    } finally {
      await closedChannels.close()
    }
  })

  it('no destraba el canal manual con un código que no lo habilita', async () => {
    const closedChannels = listen(
      createApp({
        supabaseAdmin: admin,
        notifyPaymentApplied: async () => {},
        platformSettingsRepository: {
          get: async () => ({ membershipManualEnabled: false }),
        },
        env: {
          ...process.env,
          APP_PRODUCTION: 'false',
          PAYMENTS_MOCK: 'true',
          PAID_CHECKOUT_ENABLED: 'true',
          AUTH_SECRET: process.env.AUTH_SECRET,
        },
      }),
    )

    try {
      const plan = await activePlan()
      const code = `TEST-NOCH-${randomBytes(3).toString('hex').toUpperCase()}`
      await createDiscountCode({
        organizationId: plan.organization_id,
        code,
        percentOff: 15,
        appliesTo: 'membership',
        active: true,
      })

      const { cookie } = await registerAthlete('promo')
      const response = await fetch(`${closedChannels.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: { ...mutationHeaders, Cookie: cookie },
        body: JSON.stringify({
          paymentMethod: 'manual_link',
          planCode: plan.code,
          idempotencyKey: randomUUID(),
          discountCode: code,
        }),
      })
      expect(response.status).toBe(409)
    } finally {
      await closedChannels.close()
    }
  })

  it('habilita sólo el canal que el código declara', async () => {
    // Un código de transferencia no puede servir para pagar en efectivo: son
    // dos decisiones comerciales distintas sobre la misma promo.
    const closedChannels = listen(
      createApp({
        supabaseAdmin: admin,
        notifyPaymentApplied: async () => {},
        platformSettingsRepository: {
          get: async () => ({
            membershipManualEnabled: false,
            registrationManualEnabled: false,
          }),
        },
        env: {
          ...process.env,
          APP_PRODUCTION: 'false',
          PAYMENTS_MOCK: 'true',
          PAID_CHECKOUT_ENABLED: 'true',
          AUTH_SECRET: process.env.AUTH_SECRET,
        },
      }),
    )

    try {
      const plan = await activePlan()
      const code = `TEST-ONLY-${randomBytes(3).toString('hex').toUpperCase()}`
      const saved = await createDiscountCode({
        organizationId: plan.organization_id,
        code,
        percentOff: 20,
        appliesTo: 'membership',
        active: true,
        manualChannels: ['bank_transfer'],
      })
      expect(saved.manual_channels).toEqual(['bank_transfer'])
      // El booleano histórico se deriva de la lista, no se guarda aparte.
      expect(saved.enables_manual_payment).toBe(true)

      const order = (cookie, paymentMethod) =>
        fetch(`${closedChannels.url}/api/athletes/me/membership-orders`, {
          method: 'POST',
          headers: { ...mutationHeaders, Cookie: cookie },
          body: JSON.stringify({
            paymentMethod,
            planCode: plan.code,
            idempotencyKey: randomUUID(),
            discountCode: code,
          }),
        })

      const { cookie: cashCookie } = await registerAthlete('promo')
      const cash = await order(cashCookie, 'cash_pitbull')
      expect(cash.status).toBe(409)

      const { cookie } = await registerAthlete('promo')
      const transfer = await order(cookie, 'manual_link')
      const transferBody = await transfer.json()
      expect(transfer.status, JSON.stringify(transferBody)).toBe(201)
      expect(transferBody.order.manual_payment_channel).toBe('bank_transfer')
      expect(transferBody.order.amount).toBe(plan.price - Math.floor((plan.price * 20) / 100))
    } finally {
      await closedChannels.close()
    }
  })

  it('impide crear un precio promocional con alcance combinado', async () => {
    const plan = await activePlan()
    const result = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        organizationId: plan.organization_id,
        code: `TEST-BAD-${randomBytes(3).toString('hex').toUpperCase()}`,
        kind: 'fixed_price',
        fixedPrice: 120000,
        appliesTo: 'both',
        active: true,
      },
      p_actor: 'integration-test',
    })
    expect(result.error?.message).toContain('alcance único')
  })
})
