import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Una oferta exclusiva sobre un torneo SIN combo cargado, de punta a punta
 * (20260913100000). Es el trámite que antes era imposible: había que configurar
 * el combo del evento primero, y sólo entonces se podía crear el código.
 *
 * Lo que se verifica es la cadena completa contra Postgres real: el alta
 * resuelve el paquete sola, el canje abre la ficha sin combo, la ficha sigue
 * listándose, y la compra cobra el importe pactado —no el de lista— sobre una
 * orden que empaqueta afiliación e inscripción.
 */
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('oferta exclusiva sin combo contra Supabase', () => {
  const admin = createSupabaseTestClient()
  const createdAthleteIds = []
  const createdEventIds = []
  const createdCodeIds = []

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
    if (createdCodeIds.length) {
      // Sin redenciones vivas el borrado es real; con redenciones la RPC archiva
      // —es registro contable— y la fila queda, que es lo correcto.
      for (const codeId of createdCodeIds) {
        await cleanup(
          admin.rpc('staff_delete_discount_code', {
            p_code_id: codeId,
            p_actor: 'integration-test-cleanup',
          }),
          `codigo ${codeId}`,
        )
      }
    }
    if (createdEventIds.length) {
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

  it('se crea, se canjea y se cobra sin que exista ningún combo', async () => {
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
      throw new Error(
        `Falta un plan one_time activo para el test: ${planResult.error?.message ?? ''}`,
      )
    }
    const plan = planResult.data
    const slug = `oferta-sin-combo-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Oferta sin combo integration test',
        description: 'Fixture transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 2,
        status: 'inscripcion_abierta',
        published: true,
        requires_membership: true,
        price: 45000,
        currency: plan.currency,
      })
      .select()
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)
    const competition = eventResult.data
    createdEventIds.push(competition.id)

    // A propósito NO se crea `event_combo_offers`: es todo el punto del cambio.
    const listTotal = plan.price + competition.price
    const offerPrice = Math.max(1, listTotal - 20000)
    const code = `SIN-COMBO-${randomBytes(4).toString('hex').toUpperCase()}`
    const upsert = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        code,
        description: 'Oferta exclusiva sin combo',
        kind: 'offer',
        appliesTo: 'combo',
        audience: 'code',
        eventId: competition.id,
        // El paquete lo nombra el código: es el dato que antes obligaba a
        // cargar el combo antes.
        membershipPlanId: plan.id,
        fixedPrice: offerPrice,
        manualChannels: ['bank_transfer'],
        active: true,
      },
      p_actor: 'integration-test',
    })
    if (upsert.error) throw new Error(upsert.error.message)
    expect(upsert.data.kind).toBe('offer')
    expect(upsert.data.membership_plan_id).toBe(plan.id)
    createdCodeIds.push(upsert.data.id)

    const suffix = randomUUID()
    const athleteResponse = await fetch(`${listenTarget.url}/api/athletes/register`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({
        fullName: `Oferta Athlete ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email: `oferta-${suffix}@pluarg.test`,
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
    const athleteBody = await athleteResponse.json()
    expect(athleteResponse.status, JSON.stringify(athleteBody)).toBe(201)
    const athleteId = athleteBody.athlete.id
    createdAthleteIds.push(athleteId)
    await admin
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', athleteId)

    // 1. El canje abre la ficha sin ningún combo detrás, y el paquete que
    //    anuncia es el del código.
    const unlock = await admin.rpc('athlete_unlock_offer_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
      p_code: code,
    })
    if (unlock.error) throw new Error(unlock.error.message)
    expect(unlock.data.unlocked, JSON.stringify(unlock.data)).toBe(true)
    expect(unlock.data.offer.comboOffer).toBeNull()
    expect(unlock.data.offer.membershipPlan.id).toBe(plan.id)
    expect(unlock.data.offer.fixedPrice).toBe(offerPrice)

    // 2. Y la ficha sigue listándose entre sesiones: antes el inner join contra
    //    el combo la hacía desaparecer de Mi cuenta.
    const listed = await admin.rpc('athlete_list_offer_unlocks', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
    })
    if (listed.error) throw new Error(listed.error.message)
    expect(listed.data.map((offer) => offer.code)).toContain(code)

    // 3. La compra: una sola orden con concepto combo, al importe pactado.
    const comboResponse = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: sessionCookie(athleteResponse) },
      body: JSON.stringify({
        eventSlug: slug,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
        // El código cumple los dos roles, igual que desde la ficha.
        discountCode: code,
        comboAccessCode: code,
      }),
    })
    const comboBody = await comboResponse.json()
    expect(comboResponse.status, JSON.stringify(comboBody)).toBe(201)
    expect(comboBody.order.concept).toBe('combo')
    expect(comboBody.order.amount).toBe(offerPrice)
    // El ahorro se mide contra el precio de lista, que es la base con la que
    // nació la orden. La respuesta del alta es la fila cruda de la RPC, así que
    // viaja en snake_case.
    expect(comboBody.order.discount_amount).toBe(listTotal - offerPrice)
    expect(comboBody.comboOffer).toBeNull()
    expect(comboBody.plan.id).toBe(plan.id)
    expect(comboBody.membership.athleteId ?? comboBody.membership.athlete_id).toBe(athleteId)
  })

  it('sin la llave canjeada el checkout sigue contestando 404', async () => {
    // La contracara: el paquete virtual existe sólo para quien tiene el código.
    // Sin llave y sin combo no hay nada que vender, igual que antes.
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
    const plan = planResult.data
    const slug = `sin-llave-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Sin llave integration test',
        description: 'Fixture transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 7 * 86400000).toISOString(),
        ends_at: new Date(now + 8 * 86400000).toISOString(),
        registration_opens_at: new Date(now - 86400000).toISOString(),
        registration_closes_at: new Date(now + 6 * 86400000).toISOString(),
        capacity: 2,
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

    const suffix = randomUUID()
    const athleteResponse = await fetch(`${listenTarget.url}/api/athletes/register`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({
        fullName: `Sin Llave ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email: `sin-llave-${suffix}@pluarg.test`,
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
    const athleteBody = await athleteResponse.json()
    expect(athleteResponse.status, JSON.stringify(athleteBody)).toBe(201)
    createdAthleteIds.push(athleteBody.athlete.id)
    await admin
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', athleteBody.athlete.id)

    const comboResponse = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: sessionCookie(athleteResponse) },
      body: JSON.stringify({
        eventSlug: slug,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    expect(comboResponse.status).toBe(404)
  })

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
        AUTH_SECRET: process.env.AUTH_SECRET,
      },
    }),
  )

  afterAll(async () => {
    await listenTarget.close()
  })
})
