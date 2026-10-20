import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertAthleteOrderInScope,
  assertTicketOrderInScope,
} from '../../server/modules/events/orderEventScope.js'
import { createSupabaseAthleteRepository } from '../../server/modules/athletes/supabaseAthleteRepository.js'
import { createSupabaseTicketRepository } from '../../server/modules/ticketing/supabaseTicketRepository.js'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

/**
 * El alcance por evento de las órdenes contra Postgres REAL.
 *
 * Los tests de API usan dobles de Supabase: acá se confirma que las tablas y columnas que
 * consultan los controles de orden y los listados por evento existen y se relacionan como se
 * supone (`ticket_orders.event_id`, `event_registrations.payment_order_id`, `concept`).
 */
const run = randomUUID().slice(0, 8)
const ORG = '00000000-0000-4000-8000-000000000001'

describe('alcance por evento de las órdenes (Supabase real)', () => {
  const admin = createSupabaseTestClient()
  const ids = { events: [], ticketOrders: [], athletes: [], registrations: [], orders: [] }
  let eventA
  let eventB
  const out = {}

  async function insert(table, row, select = 'id') {
    const { data, error } = await admin.from(table).insert(row).select(select).single()
    if (error) throw new Error(`${table}: ${error.message}`)
    return data
  }

  const organizerFor = (...events) => ({
    auth: {
      user: {
        eventScoped: true,
        eventAccess: events.map((event) => ({ eventId: event.id, eventSlug: event.slug })),
      },
    },
  })

  beforeAll(async () => {
    const startsAt = new Date(Date.now() + 40 * 86_400_000).toISOString()
    const endsAt = new Date(Date.now() + 41 * 86_400_000).toISOString()
    const base = {
      organization_id: ORG,
      venue: 'QA',
      location: 'CABA',
      price: 1000,
      currency: 'ARS',
      status: 'proximamente',
      published: false,
      starts_at: startsAt,
      ends_at: endsAt,
    }
    eventA = await insert('events', { ...base, slug: `int-scope-a-${run}`, title: `Int Scope A ${run}` }, 'id, slug')
    eventB = await insert('events', { ...base, slug: `int-scope-b-${run}`, title: `Int Scope B ${run}` }, 'id, slug')
    ids.events.push(eventA.id, eventB.id)

    // Entradas: una orden en cada evento.
    out.ticketA = await insert('ticket_orders', {
      event_id: eventA.id,
      amount: 20000,
      currency: 'ARS',
      provider: 'manual',
      manual_payment_channel: 'bank_transfer',
      status: 'pendiente',
    })
    out.ticketB = await insert('ticket_orders', {
      event_id: eventB.id,
      amount: 30000,
      currency: 'ARS',
      provider: 'manual',
      manual_payment_channel: 'bank_transfer',
      status: 'pendiente',
    })
    ids.ticketOrders.push(out.ticketA.id, out.ticketB.id)

    // Inscripciones: un atleta, y una orden por cada concepto.
    const athlete = await insert('athletes', {
      full_name: `Atleta Scope ${run}`,
      document_id: `9${run.replace(/\D/g, '0').padEnd(7, '0').slice(0, 7)}${Date.now() % 1000}`,
      email: `scope-${run}@pluarg.test`,
    })
    ids.athletes.push(athlete.id)
    const order = (concept, amount) =>
      insert('athlete_payment_orders', {
        organization_id: ORG,
        athlete_id: athlete.id,
        concept,
        amount,
        method: 'manual_link',
        status: 'validacion_manual',
      })
    out.regA = await order('registration', 50000)
    out.regB = await order('registration', 60000)
    out.comboA = await order('combo', 90000)
    out.membership = await order('membership', 30000)
    ids.orders.push(out.regA.id, out.regB.id, out.comboA.id, out.membership.id)

    const registration = (event, orderRow, division) =>
      insert('event_registrations', {
        athlete_id: athlete.id,
        event_id: event.id,
        division: `${division}`,
        category: 'Open',
        payment_order_id: orderRow.id,
      })
    // Un atleta tiene una sola inscripción por evento: el combo va en un tercer evento propio.
    const eventC = await insert('events', { ...base, slug: `int-scope-c-${run}`, title: `Int Scope C ${run}` }, 'id, slug')
    ids.events.push(eventC.id)
    out.eventC = eventC
    ids.registrations.push(
      (await registration(eventA, out.regA, 'Open')).id,
      (await registration(eventB, out.regB, 'Open')).id,
      (await registration(eventC, out.comboA, 'Open')).id,
    )
  }, 60_000)

  afterAll(async () => {
    await admin.from('event_registrations').delete().in('id', ids.registrations)
    await admin.from('athlete_payment_orders').delete().in('id', ids.orders)
    await admin.from('ticket_orders').delete().in('id', ids.ticketOrders)
    await admin.from('athletes').delete().in('id', ids.athletes)
    await admin.from('events').delete().in('id', ids.events)
  })

  it('el listado de entradas de un evento trae solo las de ese evento', async () => {
    const rows = await createSupabaseTicketRepository(admin).listOrdersForEvent(eventA.id)
    expect(rows.map((row) => row.order.id)).toEqual([out.ticketA.id])
    expect(rows[0].event.slug).toBe(eventA.slug)
  })

  it('el listado de inscripciones de un evento trae solo las del evento, sin combos ni afiliaciones', async () => {
    const repo = createSupabaseAthleteRepository(admin)
    const forA = await repo.listRegistrationOrdersForEvent(eventA.id)
    expect(forA.map((order) => order.id)).toEqual([out.regA.id])
    expect(forA[0].athlete.full_name).toContain('Atleta Scope')

    // El evento C solo tiene un combo: no es del organizador.
    expect(await repo.listRegistrationOrdersForEvent(out.eventC.id)).toEqual([])
    expect(await repo.listRegistrationOrdersForEvent(eventB.id).then((rows) => rows.map((r) => r.id))).toEqual([
      out.regB.id,
    ])
  })

  it('una orden de entradas del evento asignado pasa; la de otro evento no', async () => {
    const req = organizerFor(eventA)
    await expect(assertTicketOrderInScope(req, admin, out.ticketA.id)).resolves.toBeUndefined()
    await expect(assertTicketOrderInScope(req, admin, out.ticketB.id)).rejects.toMatchObject({
      status: 403,
      details: { code: 'event_not_assigned' },
    })
  })

  it('una orden que no existe es 404', async () => {
    await expect(
      assertTicketOrderInScope(organizerFor(eventA), admin, randomUUID()),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('inscripción propia pasa; ajena, combo y afiliación suelta se cortan', async () => {
    const req = organizerFor(eventA, out.eventC)
    await expect(assertAthleteOrderInScope(req, admin, out.regA.id)).resolves.toBeUndefined()
    await expect(assertAthleteOrderInScope(req, admin, out.regB.id)).rejects.toMatchObject({
      status: 403,
      details: { code: 'event_not_assigned' },
    })
    // El combo cuelga de un evento asignado (C), pero incluye la afiliación: ingreso de PLU.
    await expect(assertAthleteOrderInScope(req, admin, out.comboA.id)).rejects.toMatchObject({
      status: 403,
      details: { code: 'event_scope_forbidden_change' },
    })
    await expect(assertAthleteOrderInScope(req, admin, out.membership.id)).rejects.toMatchObject({
      status: 403,
      details: { code: 'event_not_assigned' },
    })
  })

  it('una cuenta sin restricción no consulta nada', async () => {
    const calls = []
    const spy = { from: (table) => (calls.push(table), admin.from(table)) }
    await assertTicketOrderInScope({ auth: { user: { eventScoped: false } } }, spy, out.ticketB.id)
    await assertAthleteOrderInScope({ auth: { user: { eventScoped: false } } }, spy, out.regB.id)
    expect(calls).toEqual([])
  })
})
