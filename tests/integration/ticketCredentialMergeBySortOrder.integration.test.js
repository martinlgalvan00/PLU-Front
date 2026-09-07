import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

/**
 * Camino real del panel al guardar un tipo de entrada nuevo: todavía no hay
 * `ticketTypeId`, así que la RPC resuelve por `sortOrder`. Ese lookup usaba
 * `min(uuid)` y `supabase db lint` lo rechazaba; además la llamada fallaba
 * en Postgres. Esto pega contra la función instalada, no contra el SQL
 * histórico.
 */
describe('staff_merge_ticket_type_credentials resuelve tipos nuevos por sort_order', () => {
  const supabaseAdmin = createSupabaseTestClient()
  const eventSlug = `cred-sort-${randomUUID()}`
  let eventId
  let ticketTypeId

  afterAll(async () => {
    if (ticketTypeId) {
      await supabaseAdmin.from('ticket_type_credentials').delete().eq('ticket_type_id', ticketTypeId)
      await supabaseAdmin.from('ticket_types').delete().eq('id', ticketTypeId)
    }
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId)
  })

  it('guarda credenciales sin mandar el id del tipo', async () => {
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .insert({
        slug: eventSlug,
        title: 'Credential Sort Order Smoke',
        venue: 'Test',
        location: 'Test',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        published: true,
        status: 'cupos_limitados',
        rules: { ticketsEnabled: true },
      })
      .select('id')
      .single()
    expect(eventError).toBeNull()
    eventId = event.id

    const { data: ticketType, error: ticketTypeError } = await supabaseAdmin
      .from('ticket_types')
      .insert({ event_id: eventId, name: 'General', price: 12000, sort_order: 2 })
      .select('id')
      .single()
    expect(ticketTypeError).toBeNull()
    ticketTypeId = ticketType.id

    const { data, error } = await supabaseAdmin.rpc('staff_merge_ticket_type_credentials', {
      p_event_slug: eventSlug,
      p_credentials: [
        {
          sortOrder: 2,
          credentials: [{ label: 'Puerta', zoneScopes: ['gate_tickets'] }],
        },
      ],
    })
    expect(error).toBeNull()
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticketTypeId,
          label: 'Puerta',
        }),
      ]),
    )

    const { data: rows, error: readError } = await supabaseAdmin
      .from('ticket_type_credentials')
      .select('label, zone_scopes')
      .eq('ticket_type_id', ticketTypeId)
    expect(readError).toBeNull()
    expect(rows).toEqual([{ label: 'Puerta', zone_scopes: ['gate_tickets'] }])
  })
})
