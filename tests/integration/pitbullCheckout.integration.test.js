import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const EVENT_SLUG = 'pitbull-classic-2026'
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

/**
 * Precio esperado para un canal manual (transferencia/efectivo).
 *
 * Desde `20260824100000_manual_price_per_channel.sql` la base no tiene ninguna
 * política de precios fija: la API le pasa los dos precios crudos del catálogo
 * y `plu_private.resolve_channel_price` elige `manual_price` cuando está
 * configurado, o `price` cuando es nulo.
 *
 * Esta suite prueba el *flujo* de checkout, así que deriva el monto del mismo
 * catálogo en vez de fijar un número: el seed de CI tiene cargada la promo
 * manual y la base hosteada cobra un precio único, y las dos configuraciones son
 * válidas. El contenido de la promo se verifica aparte, sobre el archivo del
 * seed, en `tests/pitbullRegistrationPriceMigration.test.js`.
 */
const manualChannelAmount = ({ price, manual_price: manualPrice }) => manualPrice ?? price

describe('checkout real de Pitbull Classic contra Supabase', () => {
  const admin = createSupabaseTestClient()
  const athleteIds = []
  const target = listen(
    createApp({
      supabaseAdmin: admin,
      notifyPaymentApplied: async () => {},
      // Inscripción y combo se crean por transferencia: el canal manual va
      // abierto por doble, no por el estado de la fila compartida.
      platformSettingsRepository: manualChannelsOpen(),
      env: { ...process.env, APP_PRODUCTION: 'true', PAYMENTS_MOCK: 'false' },
    }),
  )

  afterAll(async () => {
    await target.close()

    for (const athleteId of athleteIds) {
      const deleted = await admin.rpc('delete_athlete', {
        p_athlete_id: athleteId,
        p_actor: 'pitbull-checkout-integration-cleanup',
      })
      if (deleted.error) throw new Error(deleted.error.message)
    }

    if (athleteIds.length) {
      await admin.from('domain_audit_logs').delete().in('actor_id', athleteIds)
      await admin.from('domain_audit_logs').delete().in('entity_id', athleteIds)
      await admin.from('operational_event_logs').delete().in('actor_id', athleteIds)
      await admin.from('operational_event_logs').delete().in('entity_id', athleteIds)
    }
  })

  async function readEvent() {
    const result = await admin
      .from('events')
      .select('id, price, manual_price, currency')
      .eq('slug', EVENT_SLUG)
      .single()
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  it('crea y acredita una inscripcion individual al precio manual del catalogo', async () => {
    const athleteId = await createTestAthlete(admin, {
      email: `pitbull-registration-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)

    const event = await readEvent()

    const plan = await admin
      .from('membership_plans')
      .select('code')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .order('version', { ascending: false })
      .limit(1)
      .single()
    if (plan.error) throw new Error(plan.error.message)

    const membershipOrder = await admin.rpc('create_membership_order_v3', {
      p_athlete_id: athleteId,
      p_payment_method: 'manual_link',
      p_plan_code: plan.data.code,
      p_idempotency_key: randomUUID(),
    })
    if (membershipOrder.error) throw new Error(membershipOrder.error.message)
    const membershipProof = await admin.rpc('register_athlete_payment_proof', {
      p_order_id: membershipOrder.data.order.id,
      p_athlete_id: athleteId,
      p_proof_path: `${membershipOrder.data.order.id}/integration-proof.pdf`,
      p_notes: null,
    })
    if (membershipProof.error) throw new Error(membershipProof.error.message)
    const membershipApproved = await admin.rpc('approve_athlete_payment_order', {
      p_order_id: membershipOrder.data.order.id,
      p_actor: athleteId,
    })
    if (membershipApproved.error) throw new Error(membershipApproved.error.message)

    const cookie = await athleteSessionCookie(admin, athleteId)
    const response = await fetch(`${target.url}/api/athletes/me/registrations`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        eventSlug: EVENT_SLUG,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(201)
    expect(body.order).toMatchObject({
      amount: manualChannelAmount(event),
      currency: event.currency,
      method: 'manual_link',
      manual_payment_channel: 'bank_transfer',
    })
    expect(body.registration.payment_order_id).toBe(body.order.id)
    // Con precio manual configurado, la transferencia no puede salir al precio
    // de Mercado Pago: eso lo resuelve la base, no la UI.
    if (event.manual_price != null) {
      expect(body.order.amount).not.toBe(event.price)
    }

    const proof = await admin.rpc('register_athlete_payment_proof', {
      p_order_id: body.order.id,
      p_athlete_id: athleteId,
      p_proof_path: `${body.order.id}/integration-proof.pdf`,
      p_notes: null,
    })
    if (proof.error) throw new Error(proof.error.message)

    const approved = await admin.rpc('approve_athlete_payment_order', {
      p_order_id: body.order.id,
      p_actor: athleteId,
    })
    if (approved.error) throw new Error(approved.error.message)
    expect(approved.data.order.status).toBe('aprobado')
    expect(approved.data.registration.status).toBe('confirmada')
  })

  it('crea una sola orden combo al precio manual del catalogo y acredita ambos derechos', async () => {
    const athleteId = await createTestAthlete(admin, {
      email: `pitbull-combo-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)
    const credential = await admin
      .from('athletes')
      .select('credential_token')
      .eq('id', athleteId)
      .single()
    if (credential.error) throw new Error(credential.error.message)

    const event = await readEvent()
    const combo = await admin
      .from('event_combo_offers')
      .select('price, manual_price, currency')
      .eq('event_id', event.id)
      .single()
    if (combo.error) throw new Error(combo.error.message)

    const cookie = await athleteSessionCookie(admin, athleteId)
    const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
      method: 'POST',
      headers: { ...mutationHeaders, Cookie: cookie },
      body: JSON.stringify({
        eventSlug: EVENT_SLUG,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(201)
    expect(body.order).toMatchObject({
      amount: manualChannelAmount(combo.data),
      currency: combo.data.currency,
      method: 'manual_link',
      manual_payment_channel: 'bank_transfer',
    })
    expect(body.membership.payment_order_id).toBe(body.order.id)
    expect(body.registration.payment_order_id).toBe(body.order.id)

    const proof = await admin.rpc('register_athlete_payment_proof', {
      p_order_id: body.order.id,
      p_athlete_id: athleteId,
      p_proof_path: `${body.order.id}/integration-proof.pdf`,
      p_notes: null,
    })
    if (proof.error) throw new Error(proof.error.message)

    const approved = await admin.rpc('approve_athlete_payment_order', {
      p_order_id: body.order.id,
      p_actor: athleteId,
    })
    if (approved.error) throw new Error(approved.error.message)
    expect(approved.data.membership.status).toBe('activa')
    expect(approved.data.registration.status).toBe('confirmada')

    const resolvedQr = await admin.rpc('get_membership_by_code_or_token', {
      p_code: credential.data.credential_token,
      p_event_slug: EVENT_SLUG,
    })
    if (resolvedQr.error) throw new Error(resolvedQr.error.message)
    expect(resolvedQr.data.membership.status).toBe('activa')
    expect(resolvedQr.data.registration).toMatchObject({
      status: 'confirmada',
      event_slug: EVENT_SLUG,
    })
  })
})
