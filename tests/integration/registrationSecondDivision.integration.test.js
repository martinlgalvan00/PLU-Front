import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { resolveCompetitionDivision } from '../../shared/ageDivision.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const PRICE = 60000
// Con edad de Masters la división natural no es Open: puede sumar Open al 50%.
const MASTERS_BIRTH_DATE = '1978-03-10'

function register(baseUrl, cookie, body) {
  return fetch(`${baseUrl}/api/athletes/me/registrations`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-PLU-Request': 'browser',
      Cookie: cookie,
    },
    body: JSON.stringify({
      category: 'Raw',
      bodyweightKg: 88,
      declaredWeightClass: '90',
      paymentMethod: 'manual_link',
      idempotencyKey: randomUUID(),
      ...body,
    }),
  })
}

/**
 * La regla de cobro de dos divisiones contra la base real: la de edad al 100%,
 * Open al 50%, y lo que se elige queda guardado en la inscripción. Los tests de
 * API (api.registrationSelection) la prueban con el repositorio simulado; acá
 * se confirma que la RPC guarda la segunda división, las modalidades y el
 * importe que calculó el server.
 */
describe('inscripción en dos divisiones (create_competition_registration_checkout_v3)', () => {
  const supabaseAdmin = createSupabaseTestClient()
  const eventSlug = `second-division-${randomUUID()}`
  const startsAt = new Date(Date.now() + 20 * 86_400_000)
  const athleteIds = []
  let eventId
  let target

  async function setup() {
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: eventSlug,
        title: 'Second Division Smoke Event',
        venue: 'Test',
        location: 'Test',
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString(),
        published: true,
        status: 'inscripcion_abierta',
        requires_membership: false,
        price: PRICE,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    eventId = event.id
    target = listen(createApp({ supabaseAdmin, platformSettingsRepository: manualChannelsOpen() }))
  }

  async function athleteCookie() {
    const athleteId = await createTestAthlete(supabaseAdmin, { birth_date: MASTERS_BIRTH_DATE })
    athleteIds.push(athleteId)
    return { athleteId, cookie: await athleteSessionCookie(supabaseAdmin, athleteId) }
  }

  async function savedRegistration(athleteId) {
    const { data, error } = await supabaseAdmin
      .from('event_registrations')
      .select('division, secondary_division, modalities, payment_order_id')
      .eq('event_id', eventId)
      .eq('athlete_id', athleteId)
      .single()
    expect(error).toBeNull()
    const { data: order, error: orderError } = await supabaseAdmin
      .from('athlete_payment_orders')
      .select('amount')
      .eq('id', data.payment_order_id)
      .single()
    expect(orderError).toBeNull()
    return { ...data, order }
  }

  afterAll(async () => {
    await target?.close()
    if (eventId) await supabaseAdmin.from('event_registrations').delete().eq('event_id', eventId)
    if (athleteIds.length > 0) {
      await supabaseAdmin.from('athlete_payment_orders').delete().in('athlete_id', athleteIds)
      await supabaseAdmin.from('athlete_sessions').delete().in('athlete_id', athleteIds)
      await supabaseAdmin.from('athletes').delete().in('id', athleteIds)
    }
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId)
  })

  it('división de edad + Open: 100% + 50%, con las dos divisiones y las modalidades guardadas', async () => {
    await setup()
    const ageDivision = resolveCompetitionDivision(
      MASTERS_BIRTH_DATE,
      startsAt.toISOString().slice(0, 10),
    )
    expect(ageDivision).toBeTruthy()
    expect(ageDivision).not.toBe('Open')

    const { athleteId, cookie } = await athleteCookie()
    const response = await register(target.url, cookie, {
      eventSlug,
      division: ageDivision,
      secondaryDivision: 'Open',
      modalities: ['full_power', 'bench'],
    })
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)

    const saved = await savedRegistration(athleteId)
    expect(saved.division).toBe(ageDivision)
    expect(saved.secondary_division).toBe('Open')
    expect(saved.modalities).toEqual(['full_power', 'bench'])
    expect(Number(saved.order.amount)).toBe(PRICE * 1.5)
  })

  it('una sola división paga el 100%', async () => {
    const { athleteId, cookie } = await athleteCookie()
    const response = await register(target.url, cookie, {
      eventSlug,
      division: 'Open',
      modalities: ['full_power'],
    })
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)

    const saved = await savedRegistration(athleteId)
    expect(saved.secondary_division).toBeNull()
    expect(Number(saved.order.amount)).toBe(PRICE)
  })

  it('sin modalidad no se crea ni la inscripción ni la orden', async () => {
    const { athleteId, cookie } = await athleteCookie()
    const response = await register(target.url, cookie, { eventSlug, division: 'Open' })
    const body = await response.json()
    expect(response.status).toBe(422)
    expect(body.code).toBe('MODALITY_REQUIRED')

    const { count } = await supabaseAdmin
      .from('athlete_payment_orders')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
    expect(count).toBe(0)
  })
})
