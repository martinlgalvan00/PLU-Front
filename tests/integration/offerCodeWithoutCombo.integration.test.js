import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * El retiro de las ofertas exclusivas por código, de punta a punta.
 *
 * Este archivo nació verificando la oferta sin combo (20260913100000); dos
 * migraciones después la modalidad entera quedó retirada: 20260915100000 apagó
 * toda fila offer/access y dejó un trigger que fuerza a que ninguna nueva
 * nazca activa, y 20260916100000 sacó de Mi cuenta las fichas de códigos
 * apagados. Lo que se verifica ahora es el tombstone contra Postgres real: el
 * alta no puede reabrir la modalidad, el canje no destraba, la ficha no se
 * lista ni para quien ya la tenía canjeada, y el checkout sigue sin vender un
 * combo que no existe.
 */
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('retiro de la oferta exclusiva por código contra Supabase', () => {
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

  it('un código de oferta nace apagado y no destraba ni se lista ni se cobra', async () => {
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
    const slug = `oferta-retirada-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Oferta retirada integration test',
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

    const listTotal = plan.price + competition.price
    const offerPrice = Math.max(1, listTotal - 20000)
    const code = `RETIRADA-${randomBytes(4).toString('hex').toUpperCase()}`
    // El alta pide la oferta activa, como lo haría un panel viejo o un script:
    // la RPC la acepta (es historia contable legítima) pero el trigger la
    // fuerza a nacer apagada.
    const upsert = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        code,
        description: 'Oferta exclusiva retirada',
        kind: 'offer',
        appliesTo: 'combo',
        audience: 'code',
        eventId: competition.id,
        membershipPlanId: plan.id,
        fixedPrice: offerPrice,
        manualChannels: ['bank_transfer'],
        active: true,
      },
      p_actor: 'integration-test',
    })
    if (upsert.error) throw new Error(upsert.error.message)
    expect(upsert.data.kind).toBe('offer')
    createdCodeIds.push(upsert.data.id)

    // 1. La fila que quedó en la base está apagada, sin importar qué pidió el alta.
    const stored = await admin
      .from('discount_codes')
      .select('active')
      .eq('id', upsert.data.id)
      .single()
    expect(stored.data.active).toBe(false)

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

    // 2. El canje no abre nada. La modalidad retirada se oculta como si no
    //    existiera para no filtrar ofertas exclusivas generadas por código.
    const unlock = await admin.rpc('athlete_unlock_offer_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
      p_code: code,
    })
    if (unlock.error) throw new Error(unlock.error.message)
    expect(unlock.data.unlocked, JSON.stringify(unlock.data)).toBe(false)
    expect(unlock.data.reason).toBe('not_found')

    // 3. Ni siquiera un desbloqueo previo al retiro alimenta la ficha de Mi
    //    cuenta: es la vidriera que cerró 20260916100000. Se simula el canje
    //    viejo insertando la fila directo, como quedó en las cuentas reales.
    const unlockRow = await admin.from('discount_code_unlocks').insert({
      organization_id: plan.organization_id,
      discount_code_id: upsert.data.id,
      athlete_id: athleteId,
    })
    if (unlockRow.error) throw new Error(unlockRow.error.message)
    const listed = await admin.rpc('athlete_list_offer_unlocks', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
    })
    if (listed.error) throw new Error(listed.error.message)
    expect(listed.data.map((offer) => offer.code)).not.toContain(code)

    // 4. El checkout no vende el paquete: sin combo vigente y con la llave
    //    apagada no hay nada que cobrar, y no queda ninguna orden colgada.
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
        discountCode: code,
        comboAccessCode: code,
      }),
    })
    expect(comboResponse.status).toBe(404)
    const orders = await admin
      .from('athlete_payment_orders')
      .select('id')
      .eq('athlete_id', athleteId)
    expect(orders.data ?? []).toHaveLength(0)
  })

  it('sin combo cargado el checkout contesta 404, con código o sin él', async () => {
    // La contracara que no cambió con el retiro: sin combo vigente no hay
    // paquete que vender, igual que antes de que existieran las ofertas.
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
    const slug = `sin-combo-${randomUUID()}`
    const now = Date.now()
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Sin combo integration test',
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
        fullName: `Sin Combo ${suffix}`,
        documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
        email: `sin-combo-${suffix}@pluarg.test`,
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
