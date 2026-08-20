import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { athleteSessionCookie, createTestAthlete } from './helpers/athleteSession.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './helpers/staffSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

/**
 * Qué corta cada interruptor, por HTTP y de punta a punta.
 *
 * `platformFeatureToggles.integration.test.js` prueba la RPC; esto prueba las
 * rutas: que el canal manual cerrado devuelva 409 al crear la orden y que la
 * validación congelada devuelva 409 al aprobar, con la sesión y los permisos
 * reales. Los interruptores se inyectan como doble para no tocar la fila
 * compartida de la organización mientras corre la suite.
 *
 * `appWith` parte de los dos canales manuales abiertos y cada caso cierra lo
 * que quiere probar: el default de producción los tiene cerrados, así que sin
 * esa base ningún caso llegaría a crear la orden manual que necesita.
 */
const EVENT_SLUG = 'pitbull-classic-2026'

function appWithRepository(platformSettingsRepository, { admin, staffUsers }) {
  return listen(
    createApp({
      supabaseAdmin: admin,
      prisma: createPrismaDouble(staffUsers),
      platformSettingsRepository,
      brevo: { configured: false, send: async () => ({ messageId: 'integration-noop' }) },
      env: { ...process.env, APP_PRODUCTION: 'true', PAYMENTS_MOCK: 'false' },
    }),
  )
}

function appWith(toggles, deps) {
  return appWithRepository(manualChannelsOpen(toggles), deps)
}

describe('interruptores de canal manual y validación por HTTP', () => {
  const admin = createSupabaseTestClient()
  const athleteIds = []
  const closables = []
  const scratchEvents = []
  const ticketOrderIds = []

  afterAll(async () => {
    for (const target of closables) await target.close()

    if (ticketOrderIds.length) {
      await admin.from('tickets').delete().in('order_id', ticketOrderIds)
      await admin.from('ticket_orders').delete().in('id', ticketOrderIds)
    }
    for (const { eventId, ticketTypeId } of scratchEvents) {
      await admin.from('ticket_types').delete().eq('id', ticketTypeId)
      await admin.from('events').delete().eq('id', eventId)
      await admin.from('domain_audit_logs').delete().eq('entity_id', eventId)
    }

    for (const athleteId of athleteIds) {
      await admin.rpc('delete_athlete', {
        p_athlete_id: athleteId,
        p_actor: 'checkout-toggle-enforcement-cleanup',
      })
      await admin.from('domain_audit_logs').delete().eq('actor_id', athleteId)
      await admin.from('domain_audit_logs').delete().eq('entity_id', athleteId)
      await admin.from('operational_event_logs').delete().eq('actor_id', athleteId)
      await admin.from('operational_event_logs').delete().eq('entity_id', athleteId)
    }
  })

  async function newAthlete(label) {
    const athleteId = await createTestAthlete(admin, {
      email: `${label}-${randomUUID()}@pluarg.test`,
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
      .is('retired_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    if (plan.error) throw new Error(plan.error.message)
    return plan.data.code
  }

  function open(target) {
    closables.push(target)
    return target
  }

  /**
   * Evento y tipo de entrada propios del caso: no depende del estado mutable de
   * Pitbull (hoy con el combo apagado y la venta atada a su propio editor).
   */
  async function scratchTicketEvent() {
    const slug = `toggle-tickets-${randomUUID()}`
    const event = await admin
      .from('events')
      .insert({
        slug,
        title: 'Toggle Tickets Event',
        venue: 'Test',
        location: 'Test',
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        published: true,
        status: 'cupos_limitados',
      })
      .select('id')
      .single()
    if (event.error) throw new Error(event.error.message)

    const ticketType = await admin
      .from('ticket_types')
      .insert({ event_id: event.data.id, name: 'Día 1', price: 12000, quota: 20 })
      .select('id')
      .single()
    if (ticketType.error) throw new Error(ticketType.error.message)

    scratchEvents.push({ eventId: event.data.id, ticketTypeId: ticketType.data.id })
    return { slug, eventId: event.data.id, ticketTypeId: ticketType.data.id }
  }

  function buyTickets(baseUrl, slug, ticketTypeId, provider) {
    return fetch(`${baseUrl}/api/tickets/orders`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({
        eventSlug: slug,
        provider,
        idempotencyKey: randomUUID(),
        accessToken: randomBytes(32).toString('base64url'),
        buyer: { name: 'Toggle Buyer', email: `toggle-buyer-${randomUUID()}@pluarg.test` },
        attendees: [{ fullName: 'Toggle Buyer', dni: '30111222', ticketTypeId, addonIds: [] }],
      }),
    })
  }

  it('cierra transferencia y efectivo pero deja pasar Mercado Pago', async () => {
    const target = open(appWith({ membershipManualEnabled: false }, { admin, staffUsers: [] }))
    const athleteId = await newAthlete('manual-closed')
    const cookie = await athleteSessionCookie(admin, athleteId)
    const planCode = await activeAnnualPlanCode()

    for (const paymentMethod of ['manual_link', 'cash_pitbull']) {
      const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ planCode, paymentMethod, idempotencyKey: randomUUID() }),
      })
      const body = await response.json()
      expect(response.status, `${paymentMethod}: ${JSON.stringify(body)}`).toBe(409)
      expect(body.code).toBe('MEMBERSHIP_MANUAL_DISABLED')
    }

    // El punto del interruptor: la afiliación sigue disponible, sólo cambia el
    // medio de pago.
    const mercadoPago = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: authHeaders(cookie),
      body: JSON.stringify({
        planCode,
        paymentMethod: 'mercado_pago',
        idempotencyKey: randomUUID(),
      }),
    })
    const mpBody = await mercadoPago.json()
    expect(mercadoPago.status, JSON.stringify(mpBody)).toBe(201)
    expect(mpBody.order.method).toBe('mercado_pago')
  })

  it('mantiene el canal manual cerrado mientras el panel no lo habilite', async () => {
    // Sin `manualChannelsOpen`: la fila real no trae los canales manuales
    // encendidos y el canal es opt-in explícito, así que el alta manual cierra
    // aunque nadie haya apagado nada.
    const target = open(appWithRepository({ get: async () => ({}) }, { admin, staffUsers: [] }))
    const cookie = await athleteSessionCookie(admin, await newAthlete('manual-default'))
    const planCode = await activeAnnualPlanCode()

    const response = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: authHeaders(cookie),
      body: JSON.stringify({
        planCode,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(409)
    expect(body.code).toBe('MEMBERSHIP_MANUAL_DISABLED')

    const requirements = await fetch(
      `${target.url}/api/athletes/me/registration-access-requirements`,
      { headers: authHeaders(cookie) },
    )
    const requirementsBody = await requirements.json()
    expect(requirements.status, JSON.stringify(requirementsBody)).toBe(200)
    expect(requirementsBody).toMatchObject({
      membershipManualEnabled: false,
      registrationManualEnabled: false,
    })
  })

  it('publica el canal cerrado en los requisitos que lee el checkout', async () => {
    const target = open(
      appWith(
        { membershipManualEnabled: false, registrationManualEnabled: true },
        { admin, staffUsers: [] },
      ),
    )
    const cookie = await athleteSessionCookie(admin, await newAthlete('manual-requirements'))

    const response = await fetch(`${target.url}/api/athletes/me/registration-access-requirements`, {
      headers: authHeaders(cookie),
    })
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({
      membershipEnabled: true,
      membershipManualEnabled: false,
      registrationManualEnabled: true,
    })
  })

  it('congela la validación de afiliaciones sin frenar las inscripciones', async () => {
    const staffUsers = []
    const staff = await buildStaffUser({ email: 'finanzas-toggle@pluarg.test' })
    staffUsers.push(staff)
    const target = open(
      appWith(
        { membershipValidationEnabled: false, registrationValidationEnabled: true },
        { admin, staffUsers },
      ),
    )
    const staffCookie = (await loginStaff(target.url, { email: staff.email })).cookie

    const athleteId = await newAthlete('validation-frozen')
    const athleteCookie = await athleteSessionCookie(admin, athleteId)
    const planCode = await activeAnnualPlanCode()

    const membership = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: authHeaders(athleteCookie),
      body: JSON.stringify({
        planCode,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const membershipBody = await membership.json()
    expect(membership.status, JSON.stringify(membershipBody)).toBe(201)

    const proof = await fetch(
      `${target.url}/api/athletes/me/payment-orders/${membershipBody.order.id}/proof`,
      {
        method: 'POST',
        headers: authHeaders(athleteCookie),
        body: JSON.stringify({ proofPath: `${membershipBody.order.id}/comprobante.pdf` }),
      },
    )
    expect(proof.status).toBe(200)

    for (const [path, body] of [
      [`approve`, null],
      [`reject`, { reason: 'Prueba de interruptor.' }],
    ]) {
      const response = await fetch(
        `${target.url}/api/athletes/admin/payment-orders/${membershipBody.order.id}/${path}`,
        {
          method: 'POST',
          headers: authHeaders(staffCookie),
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
      const payload = await response.json()
      expect(response.status, `${path}: ${JSON.stringify(payload)}`).toBe(409)
      expect(payload.code).toBe('MEMBERSHIP_VALIDATION_DISABLED')
    }

    // La orden sigue intacta y esperando: congelar no rechaza nada.
    const stillOpen = await admin
      .from('athlete_payment_orders')
      .select('status')
      .eq('id', membershipBody.order.id)
      .single()
    if (stillOpen.error) throw new Error(stillOpen.error.message)
    expect(stillOpen.data.status).toBe('validacion_manual')

    // La inscripción, con su interruptor abierto, se aprueba normalmente.
    const registration = await fetch(`${target.url}/api/athletes/me/registrations`, {
      method: 'POST',
      headers: authHeaders(athleteCookie),
      body: JSON.stringify({
        eventSlug: EVENT_SLUG,
        division: 'Open',
        category: 'Raw',
        bodyweightKg: 90,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const registrationBody = await registration.json()
    expect(registration.status, JSON.stringify(registrationBody)).toBe(201)

    const registrationProof = await fetch(
      `${target.url}/api/athletes/me/payment-orders/${registrationBody.order.id}/proof`,
      {
        method: 'POST',
        headers: authHeaders(athleteCookie),
        body: JSON.stringify({ proofPath: `${registrationBody.order.id}/comprobante.pdf` }),
      },
    )
    expect(registrationProof.status).toBe(200)

    const approved = await fetch(
      `${target.url}/api/athletes/admin/payment-orders/${registrationBody.order.id}/approve`,
      { method: 'POST', headers: authHeaders(staffCookie) },
    )
    const approvedBody = await approved.json()
    expect(approved.status, JSON.stringify(approvedBody)).toBe(200)
    expect(approvedBody.registration.status).toBe('confirmada')
  })

  it('publica el estado de la venta de entradas junto a la disponibilidad', async () => {
    const target = open(appWith({ ticketEnabled: false }, { admin, staffUsers: [] }))
    const response = await fetch(`${target.url}/api/tickets/availability/${EVENT_SLUG}`)
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    // `channels` viaja junto a los dos booleanos: la pantalla decide medio por
    // medio, y con la venta cerrada ninguno queda abierto.
    expect(body.checkout).toEqual({
      ticketEnabled: false,
      ticketManualEnabled: false,
      channels: {
        mercado_pago: false,
        bank_transfer: false,
        cash_pitbull: false,
        wise_transfer: false,
      },
    })
    // La pantalla de entradas la repregunta mientras el visitante decide: el
    // borde absorbe el poll, pero con ventana corta porque de acá sale el stock
    // que se muestra antes de comprar.
    expect(response.headers.get('cache-control')).toContain('s-maxage=10')
  })

  it('corta el alta de entradas con el interruptor global, por los dos medios', async () => {
    const { slug, ticketTypeId } = await scratchTicketEvent()
    const target = open(appWith({ ticketEnabled: false }, { admin, staffUsers: [] }))

    for (const provider of ['mercado_pago', 'manual']) {
      const response = await buyTickets(target.url, slug, ticketTypeId, provider)
      const body = await response.json()
      expect(response.status, `${provider}: ${JSON.stringify(body)}`).toBe(409)
      expect(body.code).toBe('TICKET_CHECKOUT_DISABLED')
    }
  })

  it('cierra la transferencia de entradas pero deja pasar Mercado Pago', async () => {
    const { slug, ticketTypeId } = await scratchTicketEvent()
    const target = open(appWith({ ticketManualEnabled: false }, { admin, staffUsers: [] }))

    const manual = await buyTickets(target.url, slug, ticketTypeId, 'manual')
    const manualBody = await manual.json()
    expect(manual.status, JSON.stringify(manualBody)).toBe(409)
    expect(manualBody.code).toBe('TICKET_MANUAL_DISABLED')

    const mercadoPago = await buyTickets(target.url, slug, ticketTypeId, 'mercado_pago')
    const mpBody = await mercadoPago.json()
    expect(mercadoPago.status, JSON.stringify(mpBody)).toBe(201)
    ticketOrderIds.push(mpBody.order.id)
  })

  it('congela la validación de entradas sin cortar su venta', async () => {
    const { slug, ticketTypeId } = await scratchTicketEvent()
    const staffUsers = []
    const staff = await buildStaffUser({ email: 'finanzas-tickets-toggle@pluarg.test' })
    staffUsers.push(staff)

    // La orden se crea con todo abierto; el corte se prueba sobre una app que ya
    // tiene la validación congelada.
    const openApp = open(appWith({}, { admin, staffUsers }))
    const created = await buyTickets(openApp.url, slug, ticketTypeId, 'manual')
    const createdBody = await created.json()
    expect(created.status, JSON.stringify(createdBody)).toBe(201)
    ticketOrderIds.push(createdBody.order.id)

    const frozen = open(appWith({ ticketValidationEnabled: false }, { admin, staffUsers }))
    const cookie = (await loginStaff(frozen.url, { email: staff.email })).cookie

    for (const [path, body] of [
      ['approve', null],
      ['reject', { reason: 'Prueba de interruptor.' }],
    ]) {
      const response = await fetch(
        `${frozen.url}/api/tickets/orders/${createdBody.order.id}/${path}`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
      const payload = await response.json()
      expect(response.status, `${path}: ${JSON.stringify(payload)}`).toBe(409)
      expect(payload.code).toBe('TICKET_VALIDATION_DISABLED')
    }

    // Congelar no toca la orden: sigue esperando decisión.
    const stillOpen = await admin
      .from('ticket_orders')
      .select('status')
      .eq('id', createdBody.order.id)
      .single()
    if (stillOpen.error) throw new Error(stillOpen.error.message)
    expect(stillOpen.data.status).not.toBe('rechazado')
  })

  it('congela la activación y la baja manual de una afiliación', async () => {
    const staffUsers = []
    const staff = await buildStaffUser({ email: 'membresias-toggle@pluarg.test' })
    staffUsers.push(staff)

    const athleteId = await newAthlete('membership-status-frozen')
    const athleteCookie = await athleteSessionCookie(admin, athleteId)
    const planCode = await activeAnnualPlanCode()

    const openApp = open(appWith({}, { admin, staffUsers }))
    const created = await fetch(`${openApp.url}/api/athletes/me/membership-orders`, {
      method: 'POST',
      headers: authHeaders(athleteCookie),
      body: JSON.stringify({
        planCode,
        paymentMethod: 'manual_link',
        idempotencyKey: randomUUID(),
      }),
    })
    const createdBody = await created.json()
    expect(created.status, JSON.stringify(createdBody)).toBe(201)
    const membershipId = createdBody.membership.id

    const frozen = open(appWith({ membershipValidationEnabled: false }, { admin, staffUsers }))
    const cookie = (await loginStaff(frozen.url, { email: staff.email })).cookie

    // Activar a mano es acreditar sin orden, así que cae bajo el mismo
    // interruptor; la baja también, para no dejar media pantalla operativa.
    for (const status of ['activa', 'cancelada']) {
      const response = await fetch(
        `${frozen.url}/api/athletes/admin/memberships/${membershipId}/status`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ status }),
        },
      )
      const payload = await response.json()
      expect(response.status, `${status}: ${JSON.stringify(payload)}`).toBe(409)
      expect(payload.code).toBe('MEMBERSHIP_VALIDATION_DISABLED')
    }

    const untouched = await admin
      .from('memberships')
      .select('status')
      .eq('id', membershipId)
      .single()
    if (untouched.error) throw new Error(untouched.error.message)
    expect(untouched.data.status).toBe('pendiente_pago')
  })

  it('exige los dos canales abiertos para el combo', async () => {
    const staffUsers = []
    const athleteId = await newAthlete('combo-manual-closed')
    const cookie = await athleteSessionCookie(admin, athleteId)

    // El combo acredita afiliación e inscripción en la misma orden: alcanza con
    // que uno de los dos canales esté cerrado.
    for (const [toggles, code] of [
      [{ membershipManualEnabled: false }, 'MEMBERSHIP_MANUAL_DISABLED'],
      [{ registrationManualEnabled: false }, 'REGISTRATION_MANUAL_DISABLED'],
    ]) {
      const target = open(appWith(toggles, { admin, staffUsers }))
      const response = await fetch(`${target.url}/api/athletes/me/registration-combos`, {
        method: 'POST',
        headers: authHeaders(cookie),
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
      expect(response.status, `${code}: ${JSON.stringify(body)}`).toBe(409)
      expect(body.code).toBe(code)
    }
  })
})
