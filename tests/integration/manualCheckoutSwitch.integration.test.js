import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestAthlete } from './helpers/athleteSession.js'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

/**
 * Cambio de canal manual sobre una orden que ya existe.
 *
 * `create_*_checkout` fija importe y canal con un UPDATE posterior al INSERT,
 * pero sólo cuando la RPC subyacente informa `duplicate = false`. Transferencia
 * y efectivo en Pitbull comparten `method = 'manual_link'`, así que al pasar de
 * una a otra la RPC reusa la orden abierta (`duplicate = true`) y el UPDATE se
 * saltaba: la orden conservaba el canal —y el precio— del canal anterior.
 *
 * Por qué importa: `approve_athlete_payment_order` decide con el canal si
 * exige comprobante. Una orden de efectivo marcada como transferencia no se
 * puede aprobar nunca, porque el archivo que pide no existe.
 */
describe('cambio de canal manual sobre una orden pendiente', () => {
  const admin = createSupabaseTestClient()
  const athleteIds = []

  afterAll(async () => {
    for (const athleteId of athleteIds) {
      await admin.rpc('delete_athlete', {
        p_athlete_id: athleteId,
        p_actor: 'manual-checkout-switch-cleanup',
      })
      await admin.from('domain_audit_logs').delete().eq('actor_id', athleteId)
      await admin.from('domain_audit_logs').delete().eq('entity_id', athleteId)
      await admin.from('operational_event_logs').delete().eq('actor_id', athleteId)
      await admin.from('operational_event_logs').delete().eq('entity_id', athleteId)
    }
  })

  async function activeAnnualPlanCode() {
    const plan = await admin
      .from('membership_plans')
      .select('code')
      .eq('active', true)
      .eq('collection_mode', 'one_time')
      .is('retired_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    if (plan.error) throw new Error(plan.error.message)
    return plan.data.code
  }

  async function newAthlete(label) {
    const athleteId = await createTestAthlete(admin, {
      email: `${label}-${randomUUID()}@pluarg.test`,
    })
    athleteIds.push(athleteId)
    return athleteId
  }

  // El frontend renueva la clave de idempotencia cuando cambia el medio de pago
  // (`membershipAttemptRef` en src/hooks/useAppData.js), así que el escenario
  // real es clave nueva + mismo `manual_link` + otro canal.
  function membershipCheckout(athleteId, planCode, channel, amount) {
    return admin.rpc('create_membership_order_checkout', {
      p_athlete_id: athleteId,
      p_payment_method: 'manual_link',
      p_plan_code: planCode,
      p_idempotency_key: randomUUID(),
      p_discount_code: null,
      p_order_amount: amount,
      p_manual_payment_channel: channel,
    })
  }

  it('pasa el canal a efectivo en Pitbull cuando el atleta cambia de transferencia', async () => {
    const athleteId = await newAthlete('switch-cash')
    const planCode = await activeAnnualPlanCode()

    const transfer = await membershipCheckout(athleteId, planCode, 'bank_transfer', 75000)
    if (transfer.error) throw new Error(transfer.error.message)
    expect(transfer.data.order).toMatchObject({
      method: 'manual_link',
      manual_payment_channel: 'bank_transfer',
      amount: 75000,
    })

    const cash = await membershipCheckout(athleteId, planCode, 'cash_pitbull', 75000)
    if (cash.error) throw new Error(cash.error.message)

    expect(cash.data.duplicate).toBe(true)
    expect(cash.data.order.id).toBe(transfer.data.order.id)
    expect(cash.data.order.manual_payment_channel).toBe('cash_pitbull')
  })

  it('aprueba el efectivo en Pitbull sin exigir comprobante', async () => {
    const athleteId = await newAthlete('switch-cash-approve')
    const planCode = await activeAnnualPlanCode()

    const transfer = await membershipCheckout(athleteId, planCode, 'bank_transfer', 75000)
    if (transfer.error) throw new Error(transfer.error.message)
    const cash = await membershipCheckout(athleteId, planCode, 'cash_pitbull', 75000)
    if (cash.error) throw new Error(cash.error.message)

    // Efectivo se acredita en la puerta: no hay archivo que adjuntar.
    const approved = await admin.rpc('approve_athlete_payment_order', {
      p_order_id: cash.data.order.id,
      p_actor: 'manual-checkout-switch',
    })
    expect(approved.error?.message ?? null).toBeNull()
    expect(approved.data.order.status).toBe('aprobado')
    expect(approved.data.membership.status).toBe('activa')
  })

  it('vuelve a exigir comprobante si el atleta regresa a transferencia', async () => {
    const athleteId = await newAthlete('switch-back-transfer')
    const planCode = await activeAnnualPlanCode()

    const cash = await membershipCheckout(athleteId, planCode, 'cash_pitbull', 75000)
    if (cash.error) throw new Error(cash.error.message)
    const back = await membershipCheckout(athleteId, planCode, 'bank_transfer', 75000)
    if (back.error) throw new Error(back.error.message)

    expect(back.data.order.manual_payment_channel).toBe('bank_transfer')

    const approved = await admin.rpc('approve_athlete_payment_order', {
      p_order_id: back.data.order.id,
      p_actor: 'manual-checkout-switch',
    })
    expect(approved.error?.message).toContain('comprobante')
  })
})
