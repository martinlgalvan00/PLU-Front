import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const CAPACITY = 2

function registerForEvent(baseUrl, cookie, eventSlug) {
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
      division: 'Open',
      category: 'Raw',
      bodyweightKg: 83.5,
      paymentMethod: 'manual_link',
      idempotencyKey: randomUUID(),
    }),
  })
}

describe('inscripción a competencia respeta el cupo del evento (RPC create_competition_registration_v2)', () => {
  const supabaseAdmin = createSupabaseTestClient()
  // Evento y atletas propios del test, igual que ticketPurchaseCapacity: no
  // dependen de supabase/seed.sql ni del estado mutable de un evento real.
  const eventSlug = `registration-capacity-${randomUUID()}`
  const athleteIds = []
  let eventId

  afterAll(async () => {
    // Orden forzado por las FK: athlete_payment_orders.athlete_id es
    // `on delete restrict`, y events queda referenciado por las inscripciones.
    if (eventId) await supabaseAdmin.from('event_registrations').delete().eq('event_id', eventId)
    if (athleteIds.length > 0) {
      await supabaseAdmin.from('athlete_payment_orders').delete().in('athlete_id', athleteIds)
      await supabaseAdmin.from('athlete_sessions').delete().in('athlete_id', athleteIds)
      await supabaseAdmin.from('athletes').delete().in('id', athleteIds)
    }
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId)
  })

  it('acepta hasta llenar el cupo y rechaza el siguiente intento con 409/PLU04', async () => {
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .insert({
        slug: eventSlug,
        title: 'Registration Capacity Smoke Event',
        venue: 'Test',
        location: 'Test',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        published: true,
        status: 'inscripcion_abierta',
        capacity: CAPACITY,
        // El gate de afiliación es otra regla y ya tiene su propio camino en el
        // RPC; acá lo que se ejercita es exclusivamente el cupo. Al llenarse,
        // el trigger de event_state_control pasa el evento a `agotado` y el
        // RPC debe responder PLU04 (no PLU03 de inscripción cerrada).
        requires_membership: false,
        price: 15000,
      })
      .select('id')
      .single()
    expect(eventError).toBeNull()
    eventId = event.id

    const cookies = []
    for (let index = 0; index <= CAPACITY; index += 1) {
      const athleteId = await createTestAthlete(supabaseAdmin)
      athleteIds.push(athleteId)
      cookies.push(await athleteSessionCookie(supabaseAdmin, athleteId))
    }

    // El cupo se llena con inscripciones manuales: el canal va abierto por
    // doble, que es la precondición del caso y no lo que se está probando.
    const target = listen(
      createApp({ supabaseAdmin, platformSettingsRepository: manualChannelsOpen() }),
    )

    try {
      // En serie a propósito: en paralelo no probaría el conteo acumulado.
      for (let index = 0; index < CAPACITY; index += 1) {
        const response = await registerForEvent(target.url, cookies[index], eventSlug)
        expect(response.status).toBe(201)
      }

      const overflow = await registerForEvent(target.url, cookies[CAPACITY], eventSlug)
      const overflowBody = await overflow.json()

      expect(overflow.status).toBe(409)
      expect(overflowBody.code).toBe('PLU04')
      expect(overflowBody.error).toMatch(/No quedan cupos/i)
    } finally {
      await target.close()
    }
  })
})
