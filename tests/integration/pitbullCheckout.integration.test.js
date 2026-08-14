import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const EVENT_SLUG = 'pitbull-classic-2026'
const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

describe('checkout real de Pitbull Classic contra Supabase', () => {
  const admin = createSupabaseTestClient()
  const athleteIds = []
  const target = listen(createApp({
    supabaseAdmin: admin,
    notifyPaymentApplied: async () => {},
    env: { ...process.env, APP_PRODUCTION: 'true', PAYMENTS_MOCK: 'false' },
  }))

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

  it('crea y acredita una inscripcion individual por ARS 75.000', async () => {
    const athleteId = await createTestAthlete(admin, {
      email: `pitbull-registration-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)

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
      amount: 75000,
      currency: 'ARS',
      method: 'manual_link',
      manual_payment_channel: 'bank_transfer',
    })
    expect(body.registration.payment_order_id).toBe(body.order.id)

    // No depende de la UI: la propia RPC rechaza una transferencia con el
    // precio de Mercado Pago antes de crear/reanudar una orden.
    const wrongTransferPrice = await admin.rpc('create_competition_registration_checkout', {
      p_athlete_id: athleteId,
      p_event_slug: EVENT_SLUG,
      p_division: 'Open',
      p_category: 'Raw',
      p_bodyweight_kg: 90,
      p_payment_method: 'manual_link',
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 85000,
      p_manual_payment_channel: 'bank_transfer',
    })
    expect(wrongTransferPrice.error?.message).toContain('La cotizacion no coincide con la politica vigente.')

    const proof = await admin.rpc('register_athlete_payment_proof', {
      p_order_id: body.order.id,
      p_athlete_id: athleteId,
      p_proof_path: `${body.order.id}/integration-proof.pdf`,
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

  it('crea una sola orden combo de ARS 120.000 y acredita ambos derechos', async () => {
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
      amount: 120000,
      currency: 'ARS',
      method: 'manual_link',
      manual_payment_channel: 'bank_transfer',
    })
    expect(body.membership.payment_order_id).toBe(body.order.id)
    expect(body.registration.payment_order_id).toBe(body.order.id)

    const proof = await admin.rpc('register_athlete_payment_proof', {
      p_order_id: body.order.id,
      p_athlete_id: athleteId,
      p_proof_path: `${body.order.id}/integration-proof.pdf`,
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
