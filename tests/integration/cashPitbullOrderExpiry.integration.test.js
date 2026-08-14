import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestAthlete } from './helpers/athleteSession.js'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

const EVENT_SLUG = 'pitbull-classic-2026'

/**
 * Vigencia de una orden de efectivo en la sede.
 *
 * Toda orden manual nacía con `expires_at = now() + 1 day`, y lo único que
 * estiraba esa ventana era adjuntar un comprobante — algo que el canal
 * `cash_pitbull` no hace nunca, porque la plata se cobra en mano el día del
 * torneo. `expire_domain_orders` corre por pg_cron cada minuto y cancelaba la
 * orden al día siguiente de creada, arrastrando la inscripción a `cancelada`:
 * cuando el atleta aparecía a pagar, Finanzas ya no tenía nada que aprobar
 * (`PLU10 - La orden ya no admite aprobacion`).
 *
 * La ventana del efectivo tiene que cubrir el evento entero. La de
 * transferencia no cambia: ahí el plazo corto es deliberado, porque el
 * comprobante se sube el mismo día.
 */
describe('vigencia de las órdenes en efectivo', () => {
  const admin = createSupabaseTestClient()
  const athleteIds = []
  let event

  beforeAll(async () => {
    const result = await admin
      .from('events')
      .select('id, slug, starts_at, ends_at')
      .eq('slug', EVENT_SLUG)
      .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (!result.data) throw new Error(`El evento ${EVENT_SLUG} no existe en esta base.`)
    event = result.data
  })

  afterAll(async () => {
    for (const athleteId of athleteIds) {
      const deleted = await admin.rpc('delete_athlete', {
        p_athlete_id: athleteId,
        p_actor: 'cash-expiry-integration-cleanup',
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

  async function newAthlete(prefix) {
    const athleteId = await createTestAthlete(admin, {
      email: `${prefix}-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)
    return athleteId
  }

  async function activeAnnualPlanCode() {
    const plan = await admin
      .from('membership_plans')
      .select('code')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .order('version', { ascending: false })
      .limit(1)
      .single()
    if (plan.error) throw new Error(plan.error.message)
    return plan.data.code
  }

  it('una inscripción en efectivo sigue viva el día del torneo', async () => {
    const athleteId = await newAthlete('cash-registration')

    const created = await admin.rpc('create_competition_registration_checkout', {
      p_athlete_id: athleteId,
      p_event_slug: EVENT_SLUG,
      p_division: 'Open',
      p_category: 'Raw',
      p_bodyweight_kg: 90,
      p_payment_method: 'manual_link',
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'cash_pitbull',
    })
    if (created.error) throw new Error(created.error.message)

    expect(created.data.order.manual_payment_channel).toBe('cash_pitbull')
    // El cobro es presencial: la orden no puede vencer antes de que termine
    // el torneo donde se cobra.
    expect(new Date(created.data.order.expires_at).getTime()).toBeGreaterThanOrEqual(
      new Date(event.ends_at).getTime(),
    )
  })

  it('una afiliación en efectivo también cubre el torneo vigente', async () => {
    const athleteId = await newAthlete('cash-membership')

    const created = await admin.rpc('create_membership_order_checkout', {
      p_athlete_id: athleteId,
      p_payment_method: 'manual_link',
      p_plan_code: await activeAnnualPlanCode(),
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'cash_pitbull',
    })
    if (created.error) throw new Error(created.error.message)

    expect(created.data.order.manual_payment_channel).toBe('cash_pitbull')
    expect(new Date(created.data.order.expires_at).getTime()).toBeGreaterThanOrEqual(
      new Date(event.ends_at).getTime(),
    )
  })

  it('la transferencia conserva su ventana corta', async () => {
    const athleteId = await newAthlete('transfer-window')

    const created = await admin.rpc('create_competition_registration_checkout', {
      p_athlete_id: athleteId,
      p_event_slug: EVENT_SLUG,
      p_division: 'Open',
      p_category: 'Raw',
      p_bodyweight_kg: 90,
      p_payment_method: 'manual_link',
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'bank_transfer',
    })
    if (created.error) throw new Error(created.error.message)

    const expiresIn = new Date(created.data.order.expires_at).getTime() - Date.now()
    expect(expiresIn).toBeGreaterThan(0)
    // 24 h de margen para adjuntar el comprobante, ni más ni menos.
    expect(expiresIn).toBeLessThanOrEqual(25 * 60 * 60 * 1000)
  })

  // Volver atrás no puede dejar una transferencia abierta hasta el torneo: el
  // comprobante se sube el mismo día.
  it('volver de efectivo a transferencia reinstala la ventana corta', async () => {
    const athleteId = await newAthlete('switch-back-window')
    const planCode = await activeAnnualPlanCode()

    const cash = await admin.rpc('create_membership_order_checkout', {
      p_athlete_id: athleteId,
      p_payment_method: 'manual_link',
      p_plan_code: planCode,
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'cash_pitbull',
    })
    if (cash.error) throw new Error(cash.error.message)

    const back = await admin.rpc('create_membership_order_checkout', {
      p_athlete_id: athleteId,
      p_payment_method: 'manual_link',
      p_plan_code: planCode,
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'bank_transfer',
    })
    if (back.error) throw new Error(back.error.message)

    expect(back.data.order.id).toBe(cash.data.order.id)
    expect(back.data.order.manual_payment_channel).toBe('bank_transfer')
    const expiresIn = new Date(back.data.order.expires_at).getTime() - Date.now()
    expect(expiresIn).toBeLessThanOrEqual(25 * 60 * 60 * 1000)
  })

  /**
   * La contracara de la ventana larga: si la orden vive hasta el torneo, el
   * cupo queda reservado todo ese tiempo. Finanzas tiene que poder devolverlo
   * cuando el atleta no aparece, y en efectivo no hay comprobante que rechazar.
   */
  it('una orden en efectivo se rechaza sin comprobante y devuelve el cupo', async () => {
    const athleteId = await newAthlete('cash-reject')

    const created = await admin.rpc('create_competition_registration_checkout', {
      p_athlete_id: athleteId,
      p_event_slug: EVENT_SLUG,
      p_division: 'Open',
      p_category: 'Raw',
      p_bodyweight_kg: 90,
      p_payment_method: 'manual_link',
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'cash_pitbull',
    })
    if (created.error) throw new Error(created.error.message)

    const rejected = await admin.rpc('reject_athlete_payment_order', {
      p_order_id: created.data.order.id,
      p_reason: 'No se presentó a pagar en la sede.',
      p_actor: 'cash-expiry-integration',
    })
    expect(rejected.error?.message ?? null).toBeNull()
    expect(rejected.data.order.status).toBe('rechazado')

    const registration = await admin
      .from('event_registrations')
      .select('status')
      .eq('payment_order_id', created.data.order.id)
      .single()
    if (registration.error) throw new Error(registration.error.message)
    expect(registration.data.status).toBe('cancelada')
  })

  it('la transferencia sin comprobante sigue sin poder rechazarse', async () => {
    const athleteId = await newAthlete('transfer-reject-guard')

    const created = await admin.rpc('create_competition_registration_checkout', {
      p_athlete_id: athleteId,
      p_event_slug: EVENT_SLUG,
      p_division: 'Open',
      p_category: 'Raw',
      p_bodyweight_kg: 90,
      p_payment_method: 'manual_link',
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: 75000,
      p_manual_payment_channel: 'bank_transfer',
    })
    if (created.error) throw new Error(created.error.message)

    const rejected = await admin.rpc('reject_athlete_payment_order', {
      p_order_id: created.data.order.id,
      p_reason: 'Sin comprobante.',
      p_actor: 'cash-expiry-integration',
    })
    expect(rejected.error?.message).toContain('No hay comprobante para rechazar.')
  })
})
