import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * deferredFinancedPayment.integration.test.js — PLU ARG
 *
 * La otra manera de cerrar una orden financiada: `athlete_defer_financed_payment`
 * (20260926100000).
 *
 * Existe porque quien piensa pagar dentro del plazo —que es exactamente para lo
 * que sirve el financiamiento— tenía que apretar "ya pagué" para quedar
 * habilitado, y Finanzas recibía la declaración de un pago que no había
 * ocurrido. Diferir habilita igual, arranca el mismo reloj y no declara nada.
 *
 * El paso que más importa es el último. Antes de esta migración,
 * `plu_private.revoke_financed_order` cortaba con PLU10 sobre una transferencia
 * sin comprobante ni declaración, así que el barrido no podía vencer justamente
 * las órdenes diferidas: fallaba en silencio cada tres minutos y el derecho
 * quedaba vivo para siempre.
 *
 * Cubre además el canje del paquete abriendo su propia ficha en Mi cuenta, que
 * es lo que la pantalla nueva necesita del servidor.
 */
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

const DAY_MS = 86_400_000
const TERM_DAYS = 7

describe('pago diferido de una orden financiada', () => {
  const admin = createSupabaseTestClient()
  const createdAthleteIds = []
  const createdEventIds = []
  const createdCodeIds = []
  let listenTarget

  beforeAll(() => {
    listenTarget = listen(
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
  })

  afterAll(async () => {
    const run = async (operation, label) => {
      const result = await operation
      if (result.error) throw new Error(`Cleanup ${label}: ${result.error.message}`)
      return result.data ?? []
    }
    let orderIds = []
    if (createdAthleteIds.length) {
      const orders = await run(
        admin.from('athlete_payment_orders').select('id').in('athlete_id', createdAthleteIds),
        'ordenes',
      )
      orderIds = orders.map((row) => row.id)
      for (const athleteId of createdAthleteIds) {
        await run(
          admin.rpc('delete_athlete', {
            p_athlete_id: athleteId,
            p_actor: 'integration-test-cleanup',
          }),
          `atleta ${athleteId}`,
        )
      }
    }
    if (createdCodeIds.length) {
      await run(
        admin.from('discount_code_unlocks').delete().in('discount_code_id', createdCodeIds),
        'unlocks',
      )
      await run(
        admin.from('discount_code_redemptions').delete().in('discount_code_id', createdCodeIds),
        'canjes',
      )
      await run(
        admin.from('promotion_campaign_events').delete().in('discount_code_id', createdCodeIds),
        'eventos de campaña',
      )
      await run(admin.from('discount_codes').delete().in('id', createdCodeIds), 'codigos')
    }
    if (createdEventIds.length) {
      await run(admin.from('events').delete().in('id', createdEventIds), 'eventos')
    }
    const entityIds = [...createdAthleteIds, ...createdEventIds, ...createdCodeIds, ...orderIds]
    if (entityIds.length) {
      await run(
        admin.from('domain_audit_logs').delete().in('entity_id', entityIds),
        'auditoria por entidad',
      )
    }
    await listenTarget?.close()
  })

  it('habilita sin declarar el pago, y el reloj igual lo vence', async () => {
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
    const plan = planResult.data

    const now = Date.now()
    const slug = `deferred-combo-${randomUUID()}`
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: plan.organization_id,
        slug,
        title: 'Deferred combo integration test',
        description: 'Fixture del pago diferido',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 21 * DAY_MS).toISOString(),
        ends_at: new Date(now + 22 * DAY_MS).toISOString(),
        registration_opens_at: new Date(now - DAY_MS).toISOString(),
        registration_closes_at: new Date(now + 20 * DAY_MS).toISOString(),
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
    const competition = eventResult.data
    createdEventIds.push(competition.id)

    const code = `DEFER-${randomBytes(6).toString('hex').toUpperCase()}`
    const comboPrice = plan.price + competition.price - 15000
    const upsert = await admin.rpc('staff_upsert_discount_code', {
      p_code: {
        code,
        kind: 'fixed_price',
        appliesTo: 'combo',
        audience: 'code',
        fixedPrice: comboPrice,
        fixedPriceManual: comboPrice,
        eventId: competition.id,
        manualChannels: ['bank_transfer'],
        mercadoPagoEnabled: false,
        financed: true,
        financingTermDays: TERM_DAYS,
        active: true,
      },
      p_actor: 'integration-test',
    })
    if (upsert.error) throw new Error(upsert.error.message)
    createdCodeIds.push(upsert.data.id)

    const athleteId = await createTestAthlete(admin, {
      full_name: `Deferred Combo Athlete ${randomUUID().slice(0, 8)}`,
      email: `deferred-combo-${randomUUID()}@pluarg.test`,
      document_id: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
      division: 'Open',
      category: 'Raw',
      estimated_weight: 90,
    })
    createdAthleteIds.push(athleteId)
    const cookie = await athleteSessionCookie(admin, athleteId)

    // --- El canje del paquete abre su ficha, no el checkout del torneo -------
    const redeem = await admin.rpc('athlete_redeem_promotion_code', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
      p_code: code,
      p_context: { surface: 'global' },
    })
    if (redeem.error) throw new Error(redeem.error.message)
    expect(redeem.data.status, JSON.stringify(redeem.data)).toBe('accepted')
    expect(redeem.data.action).toBe('open_bundle')
    expect(redeem.data.destination.view).toBe('profile')
    expect(redeem.data.destination.tab).toBe('account-offer')
    // El slug viaja igual: la ficha cotiza y cobra contra ese torneo.
    expect(redeem.data.destination.eventSlug).toBe(slug)

    // --- Y la ficha recibe todo lo que la pantalla necesita -----------------
    const unlocks = await admin.rpc('athlete_list_offer_unlocks', {
      p_organization_id: plan.organization_id,
      p_athlete_id: athleteId,
    })
    if (unlocks.error) throw new Error(unlocks.error.message)
    const ticket = (unlocks.data ?? []).find((row) => row.code === code)
    expect(ticket, 'el paquete no llegó a la ficha').toBeTruthy()
    expect(ticket.financingTermDays).toBe(TERM_DAYS)
    expect(ticket.membershipPlan?.id).toBe(plan.id)
    expect(ticket.event?.slug).toBe(slug)
    expect(ticket.fixedPriceManual).toBe(comboPrice)

    // --- La orden, y el pago diferido ---------------------------------------
    const created = await fetch(`${listenTarget.url}/api/athletes/me/registration-combos`, {
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
    const createdBody = await created.json()
    expect(created.status, JSON.stringify(createdBody)).toBe(201)
    const orderId = createdBody.order.id

    const deferUrl = `${listenTarget.url}/api/athletes/me/payment-orders/${orderId}/financing-deferral`
    const deferred = await fetch(deferUrl, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
    })
    const deferredBody = await deferred.json()
    expect(deferred.status, JSON.stringify(deferredBody)).toBe(200)
    expect(deferredBody.entitlementsGranted).toBe(true)
    expect(deferredBody.membership.status).toBe('activa')
    expect(deferredBody.registration.status).toBe('confirmada')
    // Lo que distingue diferir de declarar: Finanzas no recibe nada que revisar.
    expect(deferredBody.order.manual_payment_declared_at).toBeNull()
    expect(deferredBody.order.status).toBe('pendiente')
    // Y la orden deja de vencer como checkout abandonado: la da de baja el plazo.
    expect(deferredBody.order.expires_at).toBeNull()
    const dueAt = Date.parse(deferredBody.order.financed_payment_due_at)
    expect(Math.abs(dueAt - (Date.now() + TERM_DAYS * DAY_MS))).toBeLessThan(60_000)

    const athleteAfterGrant = await admin
      .from('athletes')
      .select('status')
      .eq('id', athleteId)
      .single()
    expect(athleteAfterGrant.data.status).toBe('afiliado_activo')

    // Idempotente: volver a tocar el botón no reinicia el reloj.
    const again = await fetch(deferUrl, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
    })
    const againBody = await again.json()
    expect(again.status, JSON.stringify(againBody)).toBe(200)
    expect(againBody.duplicate).toBe(true)
    expect(againBody.order.financed_payment_due_at).toBe(
      deferredBody.order.financed_payment_due_at,
    )

    // --- El reloj vence una orden sin comprobante NI declaración ------------
    const backdate = await admin
      .from('athlete_payment_orders')
      .update({ financed_payment_due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', orderId)
    if (backdate.error) throw new Error(backdate.error.message)

    const sweep = await admin.rpc('expire_financed_payment_orders', {
      p_now: new Date().toISOString(),
    })
    if (sweep.error) throw new Error(sweep.error.message)
    // `failedOrders` en cero es la mitad del punto: antes de 20260926100000 esta
    // orden caía en PLU10 y el barrido la reintentaba en silencio para siempre.
    expect(sweep.data.failedOrders).toBe(0)
    expect(sweep.data.expiredOrders).toBeGreaterThanOrEqual(1)

    const expired = await admin
      .from('athlete_payment_orders')
      .select('status, cancellation_code, financed_entitlements_revoked_at')
      .eq('id', orderId)
      .single()
    expect(expired.data.status).toBe('rechazado')
    expect(expired.data.cancellation_code).toBe('financing_term_expired')
    expect(expired.data.financed_entitlements_revoked_at).not.toBeNull()

    const membership = await admin
      .from('memberships')
      .select('status')
      .eq('payment_order_id', orderId)
      .single()
    expect(membership.data.status).toBe('cancelada')

    const registration = await admin
      .from('event_registrations')
      .select('status')
      .eq('payment_order_id', orderId)
      .single()
    expect(registration.data.status).toBe('cancelada')

    const athleteAfterExpiry = await admin
      .from('athletes')
      .select('status')
      .eq('id', athleteId)
      .single()
    expect(athleteAfterExpiry.data.status).toBe('registrado')
  })
})
