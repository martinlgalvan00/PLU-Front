import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Ciclo de vida del cierre por cupo, contra Postgres real (20261001100000).
 *
 * Dos reglas nuevas alrededor de `max_redemptions`:
 *
 * 1. `quota_closed_at` distingue el autocierre por cupo de la pausa manual de
 *    staff. La liberación de un canje impago sólo reabre lo que cerró el cupo:
 *    un código que el panel apagó a mano se queda apagado aunque una orden
 *    muerta le devuelva lugar.
 * 2. Achicar el cupo por debajo de lo ya canjeado apaga el código en esa misma
 *    escritura — es el gesto de operaciones "ya canjearon N: que no se use
 *    más", sin esperar a que un atleta choque en el checkout.
 */
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('cierre por cupo: sello, pausa manual y achique contra Supabase', () => {
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
        slug: `cupo-lifecycle-${randomUUID()}`,
        title: 'Ciclo de vida del cupo integration test',
        description: 'Fixture transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 8,
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

  async function createPromoCode(overrides = {}) {
    const code = `VIDA-${randomBytes(4).toString('hex').toUpperCase()}`
    const result = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        code,
        kind: 'fixed_price',
        appliesTo: 'combo',
        eventId: event.id,
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

  async function readCode(codeId) {
    const result = await admin
      .from('discount_codes')
      .select('active, quota_closed_at, max_redemptions')
      .eq('id', codeId)
      .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  function redeemCode(athlete, code) {
    return admin.rpc('athlete_redeem_promotion_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athlete.id,
      p_code: code,
    })
  }

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

  async function buyCombo(athlete, code) {
    const response = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
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
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)
    return body.order
  }

  async function killOrder(orderId) {
    const result = await admin
      .from('athlete_payment_orders')
      .update({ status: 'cancelado', updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (result.error) throw new Error(result.error.message)
  }

  it('el autocierre sella, y sin pausa manual la orden muerta reabre el cupo', async () => {
    const saved = await createPromoCode({ maxRedemptions: 1 })
    const athlete = await createAthlete('Sello-A')
    const order = await buyCombo(athlete, saved.code)

    // La compra llenó el cupo: el código se apagó y quedó SELLADO como
    // autocierre — la marca que distingue este apagado de una pausa de staff.
    const closed = await readCode(saved.id)
    expect(closed.active).toBe(false)
    expect(closed.quota_closed_at).toBeTruthy()

    // La orden muere sin pago: el trigger libera la redención y, como el
    // apagado fue del cupo, el código vuelve a ofrecerse (conducta de
    // 20260906100000, que tenía que sobrevivir a esta migración).
    await killOrder(order.id)
    const reopened = await readCode(saved.id)
    expect(reopened.active).toBe(true)
    expect(reopened.quota_closed_at).toBeNull()
  })

  it('la pausa manual de staff sobrevive a la liberación del canje', async () => {
    const saved = await createPromoCode({ maxRedemptions: 1 })
    const athlete = await createAthlete('Pausa-A')
    const spectator = await createAthlete('Pausa-B')
    const order = await buyCombo(athlete, saved.code)

    // Con el cupo lleno, staff decide apagarlo A MANO (radio "off" del panel).
    // La decisión manual borra el sello del autocierre.
    const paused = await admin.rpc('staff_set_discount_code_state', {
      p_code_id: saved.id,
      p_active: false,
      p_audience: null,
      p_actor: 'integration-test',
    })
    if (paused.error) throw new Error(paused.error.message)
    const afterPause = await readCode(saved.id)
    expect(afterPause.active).toBe(false)
    expect(afterPause.quota_closed_at).toBeNull()

    // La orden muere y libera el lugar — pero la pausa era de staff, no del
    // cupo: el código NO revive. Antes de 20261001100000 acá volvía a
    // active=true contra la decisión del panel.
    await killOrder(order.id)
    const stillPaused = await readCode(saved.id)
    expect(stillPaused.active).toBe(false)

    const redemptions = await admin
      .from('discount_code_redemptions')
      .select('id')
      .eq('discount_code_id', saved.id)
    expect(redemptions.data).toHaveLength(0)

    // Y el canje lo dice como corresponde: inactivo.
    const redeem = await redeemCode(spectator, saved.code)
    if (redeem.error) throw new Error(redeem.error.message)
    expect(redeem.data.status).toBe('rejected')
    expect(redeem.data.reason).toBe('inactive')
  })

  it('achicar el cupo por debajo de lo canjeado apaga el código ahí mismo', async () => {
    const saved = await createPromoCode({ maxRedemptions: 3 })
    const athlete = await createAthlete('Achique-A')
    const spectator = await createAthlete('Achique-B')
    await buyCombo(athlete, saved.code)

    // Con 1 de 3 canjes el código sigue vivo.
    const beforeShrink = await readCode(saved.id)
    expect(beforeShrink.active).toBe(true)

    // Operaciones baja el tope a lo ya canjeado: "que no se use más". El
    // trigger cierra y sella en la misma escritura, venga del panel o de
    // cualquier otro escritor de max_redemptions.
    const shrink = await admin
      .from('discount_codes')
      .update({ max_redemptions: 1 })
      .eq('id', saved.id)
    if (shrink.error) throw new Error(shrink.error.message)

    const afterShrink = await readCode(saved.id)
    expect(afterShrink.active).toBe(false)
    expect(afterShrink.quota_closed_at).toBeTruthy()

    const redeem = await redeemCode(spectator, saved.code)
    if (redeem.error) throw new Error(redeem.error.message)
    expect(redeem.data.status).toBe('rejected')
    expect(['inactive', 'limit_reached']).toContain(redeem.data.reason)

    // Ampliar el cupo no lo prende solo (prenderlo es una decisión), pero la
    // reactivación manual ahora sí pasa la guarda de cupo lleno.
    const grow = await admin.from('discount_codes').update({ max_redemptions: 3 }).eq('id', saved.id)
    if (grow.error) throw new Error(grow.error.message)
    const afterGrow = await readCode(saved.id)
    expect(afterGrow.active).toBe(false)

    const reactivate = await admin.rpc('staff_set_discount_code_state', {
      p_code_id: saved.id,
      p_active: true,
      p_audience: null,
      p_actor: 'integration-test',
    })
    if (reactivate.error) throw new Error(reactivate.error.message)
    const reactivated = await readCode(saved.id)
    expect(reactivated.active).toBe(true)
    expect(reactivated.quota_closed_at).toBeNull()
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
