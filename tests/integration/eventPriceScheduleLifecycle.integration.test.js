import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

/**
 * Ciclo de vida del precio programado del evento, contra Postgres real.
 *
 * 20260929100000 dejó el cambio programado (tres columnas + barrido por cron),
 * pero `staff_upsert_event` — el guardado del editor — escribe `price` sin
 * saber que la programación existe. 20261002100000 agrega el trigger que
 * cancela la programación cuando alguien pisa el precio sin gestionarla, con
 * la misma semántica que ya tenía el cambio inmediato de Tarifas.
 */
describe('precio programado del evento contra Supabase', () => {
  const admin = createSupabaseTestClient()
  const createdEventIds = []
  let organizationId
  let slug
  let eventId

  beforeAll(async () => {
    const planResult = await admin
      .from('membership_plans')
      .select('organization_id')
      .limit(1)
      .maybeSingle()
    if (planResult.error || !planResult.data) {
      throw new Error(`Sin organización de fixture: ${planResult.error?.message ?? ''}`)
    }
    organizationId = planResult.data.organization_id

    const now = Date.now()
    slug = `precio-programado-${randomUUID()}`
    const eventResult = await admin
      .from('events')
      .insert({
        organization_id: organizationId,
        slug,
        title: 'Precio programado integration test',
        description: 'Fixture transaccional',
        venue: 'Test venue',
        location: 'Buenos Aires',
        starts_at: new Date(now + 30 * 86400000).toISOString(),
        ends_at: new Date(now + 31 * 86400000).toISOString(),
        capacity: 5,
        status: 'proximamente',
        published: false,
        price: 80000,
        currency: 'ARS',
      })
      .select()
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)
    eventId = eventResult.data.id
    createdEventIds.push(eventId)
  })

  afterAll(async () => {
    if (createdEventIds.length) {
      const cleanup = await admin.from('events').delete().in('id', createdEventIds)
      if (cleanup.error) throw new Error(`Cleanup eventos: ${cleanup.error.message}`)
      const audit = await admin
        .from('domain_audit_logs')
        .delete()
        .in('entity_id', createdEventIds.map(String))
      if (audit.error) throw new Error(`Cleanup auditoría: ${audit.error.message}`)
    }
  })

  async function readEvent() {
    const result = await admin
      .from('events')
      .select('price, manual_price, scheduled_price, scheduled_manual_price, price_effective_at')
      .eq('id', eventId)
      .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  async function schedule(price, effectiveAt) {
    const result = await admin.rpc('staff_set_event_registration_price', {
      p_event_slug: slug,
      p_price: price,
      p_manual_price: null,
      p_effective_at: effectiveAt,
      p_actor: 'integration-test',
    })
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  it('editar el evento sin tocar el precio conserva la programación', async () => {
    await schedule(90000, new Date(Date.now() + 3 * 86400000).toISOString())

    const rename = await admin
      .from('events')
      .update({ title: 'Título editado sin tocar el precio' })
      .eq('id', eventId)
    if (rename.error) throw new Error(rename.error.message)

    const after = await readEvent()
    expect(after.scheduled_price).toBe(90000)
    expect(after.price_effective_at).toBeTruthy()
  })

  it('pisar el precio sin gestionar la programación la cancela y lo audita', async () => {
    // El estado previo trae la programación del test anterior; la secuencia es
    // exactamente la del bug: Tarifas programa, alguien guarda el evento desde
    // su editor con otro precio, y la programación vieja quedaba viva.
    const overwrite = await admin.from('events').update({ price: 82000 }).eq('id', eventId)
    if (overwrite.error) throw new Error(overwrite.error.message)

    const after = await readEvent()
    expect(after.price).toBe(82000)
    expect(after.scheduled_price).toBeNull()
    expect(after.scheduled_manual_price).toBeNull()
    expect(after.price_effective_at).toBeNull()

    const audit = await admin
      .from('domain_audit_logs')
      .select('action, actor_id, metadata')
      .eq('entity_id', String(eventId))
      .eq('action', 'event.registration_price_schedule_cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (audit.error) throw new Error(audit.error.message)
    expect(audit.data?.actor_id).toBe('price-overwrite')
    expect(audit.data?.metadata?.scheduledPrice).toBe(90000)
  })

  it('el barrido del cron aplica el cambio cuando llega la fecha', async () => {
    const effectiveAt = new Date(Date.now() + 3600_000).toISOString()
    await schedule(95000, effectiveAt)

    // Todavía no es la hora: el barrido no toca nada.
    const early = await admin.rpc('apply_scheduled_event_registration_prices', {
      p_now: new Date().toISOString(),
    })
    if (early.error) throw new Error(early.error.message)
    expect((await readEvent()).price).toBe(82000)

    // Llega la fecha: el precio entra y la programación se limpia — el camino
    // que el trigger de 20261002100000 no debe interferir (ese UPDATE cambia
    // price y price_effective_at juntos).
    const due = await admin.rpc('apply_scheduled_event_registration_prices', {
      p_now: new Date(Date.now() + 2 * 3600_000).toISOString(),
    })
    if (due.error) throw new Error(due.error.message)
    expect(due.data).toBeGreaterThanOrEqual(1)

    const after = await readEvent()
    expect(after.price).toBe(95000)
    expect(after.scheduled_price).toBeNull()
    expect(after.price_effective_at).toBeNull()
  })
})
