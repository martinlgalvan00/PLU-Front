import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Cupo y ventana de un código, contra Postgres real.
 *
 * Son las dos cosas que el operador carga esperando que "el siguiente sea
 * inválido", y las dos viven en la transacción que crea la orden —no en el
 * navegador ni en el panel—. Acá se verifica el borde exacto: el último cupo se
 * consume, el código se apaga solo, y el que llega después es rechazado en las
 * tres puertas (canje, preview y checkout). Lo mismo con una promo vencida y con
 * una que todavía no abrió.
 *
 * El vehículo es un código `fixed_price` sobre el combo del evento: las
 * modalidades offer/access están retiradas (20260915100000 las fuerza a nacer
 * apagadas), pero cupo y ventana son de `discount_codes`, no de una modalidad,
 * y siguen custodiando los códigos promocionales vivos.
 */
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('cupo y ventana de un código contra Supabase', () => {
  const admin = createSupabaseTestClient()
  const createdAthleteIds = []
  const createdEventIds = []
  const createdCodeIds = []
  let plan
  let event
  let comboPrice

  beforeAll(async () => {
    const nowIso = new Date().toISOString()
    const planResult = await admin
      .from('membership_plans')
      .select('*')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .lte('effective_from', nowIso)
      .or(`retired_at.is.null,retired_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle()
    if (planResult.error || !planResult.data) {
      throw new Error(`Falta un plan one_time activo: ${planResult.error?.message ?? ''}`)
    }
    plan = planResult.data

    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug: `cupo-y-ventana-${randomUUID()}`,
        title: 'Cupo y ventana integration test',
        description: 'Fixture transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 5,
        status: 'inscripcion_abierta',
        published: true,
        requires_membership: true,
        price: 45000,
        currency: plan.currency,
      })
      .select()
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)
    event = eventResult.data
    createdEventIds.push(event.id)

    // El código promociona el combo, así que el combo tiene que existir: es la
    // base sobre la que el preview y la orden miden el ahorro.
    comboPrice = plan.price + event.price
    const offerResult = await admin.from('event_combo_offers').insert({
      organization_id: plan.organization_id,
      event_id: event.id,
      membership_plan_id: plan.id,
      price: comboPrice,
      currency: plan.currency,
      active: true,
    })
    if (offerResult.error) throw new Error(offerResult.error.message)
  })

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
    for (const codeId of createdCodeIds) {
      await cleanup(
        admin.rpc('staff_delete_discount_code', {
          p_code_id: codeId,
          p_actor: 'integration-test-cleanup',
        }),
        `codigo ${codeId}`,
      )
    }
    if (createdEventIds.length) {
      await cleanup(
        admin.from('event_combo_offers').delete().in('event_id', createdEventIds),
        'ofertas combo',
      )
      await cleanup(admin.from('events').delete().in('id', createdEventIds), 'eventos')
    }
    const entityIds = [...orderIds, ...createdEventIds, ...createdCodeIds]
    if (createdAthleteIds.length) {
      await cleanup(
        admin.from('domain_audit_logs').delete().in('actor_id', createdAthleteIds),
        'auditoria por actor',
      )
    }
    if (entityIds.length) {
      await cleanup(
        admin.from('domain_audit_logs').delete().in('entity_id', entityIds),
        'auditoria por entidad',
      )
    }
  })

  /** Un código promocional de precio fijo sobre el combo del fixture. */
  async function createPromoCode(overrides = {}) {
    const code = `CUPO-${randomBytes(4).toString('hex').toUpperCase()}`
    const result = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        code,
        kind: 'fixed_price',
        appliesTo: 'combo',
        fixedPrice: Math.max(1, comboPrice - 20000),
        manualChannels: ['bank_transfer'],
        active: true,
        organizationId: plan.organization_id,
        ...overrides,
      },
      p_actor: 'integration-test',
    })
    if (result.error) throw new Error(result.error.message)
    createdCodeIds.push(result.data.id)
    return result.data
  }

  /** El canje universal: la puerta que abre la campaña desde el navegador. */
  function redeemCode(athlete, code) {
    return admin.rpc('athlete_redeem_promotion_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athlete.id,
      p_code: code,
    })
  }

  /** Un atleta con email verificado y su cookie de sesión. */
  async function createAthlete(label) {
    const suffix = randomUUID()
    const response = await fetch(`${listenTarget.url}/api/athletes/register`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({
        fullName: `${label} ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email: `${label.toLowerCase()}-${suffix}@pluarg.test`,
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
    return { id: body.athlete.id, cookie: sessionCookie(response) }
  }

  function buyCombo(athlete, code) {
    return fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: athlete.cookie },
      body: JSON.stringify({
        eventSlug: event.slug,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
        discountCode: code,
      }),
    })
  }

  it('con un solo canje, el segundo atleta queda afuera en las tres puertas', async () => {
    const saved = await createPromoCode({ maxRedemptions: 1 })
    const first = await createAthlete('Cupo-A')
    const second = await createAthlete('Cupo-B')

    // Los dos alcanzan a canjear el código: el canje no consume cupo, y eso es
    // deliberado. El cupo se consume al comprar.
    for (const athlete of [first, second]) {
      const redeem = await redeemCode(athlete, saved.code)
      if (redeem.error) throw new Error(redeem.error.message)
      expect(redeem.data.status, JSON.stringify(redeem.data)).toBe('accepted')
    }

    const bought = await buyCombo(first, saved.code)
    const boughtBody = await bought.json()
    expect(bought.status, JSON.stringify(boughtBody)).toBe(201)
    expect(boughtBody.order.amount).toBe(saved.fixed_price)

    // 1. La base: el cupo quedó consumido y el código se apagó solo, en la
    //    misma transacción que registró la redención (20260821150000).
    const after = await admin
      .from('discount_codes')
      .select('active')
      .eq('id', saved.id)
      .maybeSingle()
    expect(after.data.active).toBe(false)
    const redemptions = await admin
      .from('discount_code_redemptions')
      .select('id')
      .eq('discount_code_id', saved.id)
    expect(redemptions.data).toHaveLength(1)

    // 2. El canje: quien llega después recibe el rechazo, no la campaña.
    const lateRedeem = await redeemCode(second, saved.code)
    if (lateRedeem.error) throw new Error(lateRedeem.error.message)
    expect(lateRedeem.data.status).toBe('rejected')
    expect(['limit_reached', 'inactive']).toContain(lateRedeem.data.reason)

    // 3. El preview: el checkout no anuncia un ahorro que no va a poder cobrar.
    const preview = await admin.rpc('athlete_preview_discount_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: second.id,
      p_code: saved.code,
      p_applies_to: 'combo',
      p_base_amount: comboPrice,
      p_payment_method: 'manual_link',
    })
    expect(preview.data.valid).toBe(false)
    expect(['limit_reached', 'inactive']).toContain(preview.data.reason)

    // 4. El checkout: la puerta que no se puede eludir desde el navegador.
    const late = await buyCombo(second, saved.code)
    expect(late.status).toBeGreaterThanOrEqual(400)
    const orders = await admin
      .from('athlete_payment_orders')
      .select('id')
      .eq('athlete_id', second.id)
    expect(orders.data ?? []).toHaveLength(0)
  })

  it('una promo vencida no se canjea ni se cobra', async () => {
    const saved = await createPromoCode({
      expiresAt: new Date(Date.now() - 3600_000).toISOString(),
    })
    const athlete = await createAthlete('Vencido')

    const redeem = await redeemCode(athlete, saved.code)
    if (redeem.error) throw new Error(redeem.error.message)
    expect(redeem.data.status).toBe('rejected')
    expect(redeem.data.reason).toBe('expired')

    const preview = await admin.rpc('athlete_preview_discount_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athlete.id,
      p_code: saved.code,
      p_applies_to: 'combo',
      p_base_amount: comboPrice,
      p_payment_method: 'manual_link',
    })
    expect(preview.data.valid).toBe(false)
    expect(preview.data.reason).toBe('expired')

    const response = await buyCombo(athlete, saved.code)
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('una promo programada todavía no vale, y lo dice sin confundirla con inválida', async () => {
    const startsAt = new Date(Date.now() + 7 * 86400000).toISOString()
    const saved = await createPromoCode({ startsAt })
    const athlete = await createAthlete('Programado')

    const redeem = await redeemCode(athlete, saved.code)
    if (redeem.error) throw new Error(redeem.error.message)
    expect(redeem.data.status).toBe('rejected')
    // No es "no existe" ni "venció": el código sirve, más tarde.
    expect(redeem.data.reason).toBe('not_started')
    expect(redeem.data.startsAt).toBeTruthy()

    const preview = await admin.rpc('athlete_preview_discount_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athlete.id,
      p_code: saved.code,
      p_applies_to: 'combo',
      p_base_amount: comboPrice,
      p_payment_method: 'manual_link',
    })
    expect(preview.data.valid).toBe(false)
    expect(preview.data.reason).toBe('not_started')

    const response = await buyCombo(athlete, saved.code)
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  const listenTarget = listen(
    createApp({
      supabaseAdmin: admin,
      notifyPaymentApplied: async () => {},
      platformSettingsRepository: manualChannelsOpen(),
      env: {
        ...process.env,
        APP_PRODUCTION: 'false',
        PAYMENTS_MOCK: 'true',
        AUTH_SECRET: process.env.AUTH_SECRET,
      },
    }),
  )

  afterAll(async () => {
    await listenTarget.close()
  })
})
