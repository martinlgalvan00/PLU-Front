import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Reinscripción tras una inscripción cancelada.
 *
 * `event_registrations` tiene `unique (event_id, athlete_id)` desde
 * 20260706030000. Cuando el cron de vencimiento cancela la inscripción de una
 * orden impaga, el atleta que vuelve a intentar choca contra esa restricción y
 * ve el error de Postgres en pantalla:
 *
 *   duplicate key value violates unique constraint
 *   "event_registrations_event_id_athlete_id_key"
 *
 * Pasó de verdad en Pitbull Classic 2026 y dejó a nueve atletas sin poder
 * inscribirse. Los tests estáticos cuidan la forma de las RPC; este cuida el
 * comportamiento: la fila cancelada se reactiva y el atleta vuelve a elegir.
 */

function registerForEvent(baseUrl, cookie, eventSlug, { division, category, bodyweightKg }) {
  return fetch(`${baseUrl}/api/athletes/me/registrations`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-PLU-Request': 'browser',
      Cookie: cookie,
    },
    body: JSON.stringify({
      eventSlug,
      division,
      category,
      bodyweightKg,
      paymentMethod: 'manual_link',
      idempotencyKey: randomUUID(),
    }),
  })
}

describe('reinscripción después de una inscripción cancelada', () => {
  const supabaseAdmin = createSupabaseTestClient()
  const eventSlug = `reregistration-${randomUUID()}`
  const athleteIds = []
  let eventId

  afterAll(async () => {
    // Mismo orden que competitionRegistrationCapacity: las FK son
    // `on delete restrict`.
    if (eventId) await supabaseAdmin.from('event_registrations').delete().eq('event_id', eventId)
    if (athleteIds.length > 0) {
      await supabaseAdmin.from('athlete_payment_orders').delete().in('athlete_id', athleteIds)
      await supabaseAdmin.from('athlete_sessions').delete().in('athlete_id', athleteIds)
      await supabaseAdmin.from('athletes').delete().in('id', athleteIds)
    }
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId)
  })

  async function createEvent() {
    const { data, error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: eventSlug,
        title: 'Reregistration Smoke Event',
        venue: 'Test',
        location: 'Test',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        published: true,
        status: 'inscripcion_abierta',
        requires_membership: false,
        price: 15000,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    eventId = data.id
    return data.id
  }

  async function registrationRows(athleteId) {
    const { data, error } = await supabaseAdmin
      .from('event_registrations')
      .select('id, status, division, category, bodyweight_kg, payment_order_id')
      .eq('event_id', eventId)
      .eq('athlete_id', athleteId)
    expect(error).toBeNull()
    return data
  }

  it('reactiva la inscripción que dejó el vencimiento y deja volver a elegir categoría', async () => {
    await createEvent()
    const athleteId = await createTestAthlete(supabaseAdmin)
    athleteIds.push(athleteId)
    const cookie = await athleteSessionCookie(supabaseAdmin, athleteId)

    const target = listen(
      createApp({ supabaseAdmin, platformSettingsRepository: manualChannelsOpen() }),
    )

    try {
      const first = await registerForEvent(target.url, cookie, eventSlug, {
        division: 'Masters',
        category: 'Raw',
        bodyweightKg: 83.5,
      })
      expect(first.status).toBe(201)

      const [original] = await registrationRows(athleteId)
      expect(original.status).toBe('pendiente_pago')

      // Estado que deja `expire_domain_orders` cuando la orden no se paga: la
      // inscripción queda cancelada y la orden cancelada. Se escribe a mano
      // porque llamar al cron real vencería órdenes vivas de otros atletas.
      await supabaseAdmin
        .from('athlete_payment_orders')
        .update({ status: 'cancelado' })
        .eq('id', original.payment_order_id)
      await supabaseAdmin
        .from('event_registrations')
        .update({ status: 'cancelada' })
        .eq('id', original.id)

      const retry = await registerForEvent(target.url, cookie, eventSlug, {
        division: 'Open',
        category: 'Raw With Wraps',
        bodyweightKg: 90,
      })
      const retryBody = await retry.json()
      expect(
        retry.status,
        `reintento rechazado: ${JSON.stringify(retryBody)}`,
      ).toBe(201)

      const rows = await registrationRows(athleteId)
      // Una sola fila: se reactivó la existente, no se insertó otra.
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(original.id)
      expect(rows[0].status).toBe('pendiente_pago')
      expect(rows[0].payment_order_id).not.toBe(original.payment_order_id)
      // La cancelada dejó de ser un compromiso: la nueva selección manda.
      expect(rows[0].division).toBe('Open')
      expect(rows[0].category).toBe('Raw With Wraps')
      expect(Number(rows[0].bodyweight_kg)).toBe(90)
    } finally {
      await target.close()
    }
  })

  it('reemplaza la orden vencida que todavía figura pendiente', async () => {
    const athleteId = await createTestAthlete(supabaseAdmin)
    athleteIds.push(athleteId)
    const cookie = await athleteSessionCookie(supabaseAdmin, athleteId)

    const target = listen(
      createApp({ supabaseAdmin, platformSettingsRepository: manualChannelsOpen() }),
    )

    try {
      const first = await registerForEvent(target.url, cookie, eventSlug, {
        division: 'Junior',
        category: 'Raw',
        bodyweightKg: 74,
      })
      expect(first.status).toBe(201)

      const [original] = await registrationRows(athleteId)

      // El cron todavía no pasó: la orden ya venció pero la inscripción sigue
      // viva. `resume_pending_event_registration_checkout` la cancela y devuelve
      // null, y sin el fix el INSERT posterior chocaba igual.
      await supabaseAdmin
        .from('athlete_payment_orders')
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq('id', original.payment_order_id)

      const retry = await registerForEvent(target.url, cookie, eventSlug, {
        division: 'Junior',
        category: 'Raw',
        bodyweightKg: 74,
      })
      const retryBody = await retry.json()
      expect(
        retry.status,
        `reintento rechazado: ${JSON.stringify(retryBody)}`,
      ).toBe(201)

      const rows = await registrationRows(athleteId)
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(original.id)
      expect(rows[0].status).toBe('pendiente_pago')
      expect(rows[0].payment_order_id).not.toBe(original.payment_order_id)
    } finally {
      await target.close()
    }
  })

  it('una inscripción viva sigue devolviendo el conflicto de negocio, no un 23505', async () => {
    const athleteId = await createTestAthlete(supabaseAdmin)
    athleteIds.push(athleteId)
    const cookie = await athleteSessionCookie(supabaseAdmin, athleteId)

    const target = listen(
      createApp({ supabaseAdmin, platformSettingsRepository: manualChannelsOpen() }),
    )

    try {
      const first = await registerForEvent(target.url, cookie, eventSlug, {
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 83,
      })
      expect(first.status).toBe(201)

      const [original] = await registrationRows(athleteId)
      // Ya admitida: no hay checkout que reanudar.
      await supabaseAdmin
        .from('event_registrations')
        .update({ status: 'confirmada' })
        .eq('id', original.id)

      const retry = await registerForEvent(target.url, cookie, eventSlug, {
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 83,
      })
      const body = await retry.json()

      expect(retry.status).toBe(409)
      expect(body.code).toBe('PLU08')
      expect(body.error).not.toMatch(/constraint/i)
    } finally {
      await target.close()
    }
  })
})
