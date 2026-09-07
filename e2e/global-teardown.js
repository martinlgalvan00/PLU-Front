import { readFile, rm } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { resolveLocalSupabase } from './local-supabase.js'
import { deleteEventsByIds } from './fixture-cleanup.js'
import { FIXTURE_PATH } from './global-setup.js'
import { deleteSecurityStaff } from './staff-fixture.js'

/** Borra todo lo que creó global-setup.js, corra lo que corra haya salido. */
export default async function globalTeardown() {
  let fixture
  try {
    fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  } catch {
    return
  }

  const supabase = resolveLocalSupabase()
  const admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    if (fixture.athleteId) {
      const { data: orders } = await admin
        .from('athlete_payment_orders')
        .select('id')
        .eq('athlete_id', fixture.athleteId)
      const orderIds = (orders ?? []).map((row) => row.id)
      if (orderIds.length) {
        await admin.from('embedded_payment_attempts').delete().in('order_id', orderIds)
      }
      await admin.from('discount_code_redemptions').delete().eq('athlete_id', fixture.athleteId)
      await admin.rpc('delete_athlete', {
        p_athlete_id: fixture.athleteId,
        p_actor: 'e2e:checkout-coupon-cleanup',
      })
    }
    for (const code of [fixture.discountCode, fixture.manualOnlyDiscountCode]) {
      if (code) await admin.from('discount_codes').delete().eq('code', code)
    }
    await deleteSecurityStaff()
    await deleteEventsByIds(admin, [
      fixture.eventId,
      fixture.manualOnlyEventId,
      fixture.ticketEventId,
      fixture.soldOutEventId,
      fixture.pausedEventId,
    ])
    await admin
      .from('domain_audit_logs')
      .delete()
      .or(
        `actor_id.eq.e2e:checkout-coupon,actor_id.eq.e2e:ticket-sales,actor_id.eq.${fixture.athleteId ?? 'x'}`,
      )
  } catch (error) {
    console.warn(`Cleanup incompleto: ${error.message}`)
  } finally {
    await rm(FIXTURE_PATH, { force: true }).catch(() => {})
  }
}
