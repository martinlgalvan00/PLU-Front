import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { wipeStaleE2eEvents } from './fixture-cleanup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'
import { seedSecurityStaff } from './staff-fixture.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const FIXTURE_PATH = join(__dirname, '.fixture.json')
export const AUTH_STATE_PATH = join(__dirname, '.auth', 'athlete.json')

/**
 * Fixture efímera para el E2E de cupón + checkout: un atleta con perfil
 * competitivo completo (para no depender de llenar el formulario), un evento
 * de QA y un código de precio fijo que habilita transferencia y Mercado Pago.
 * Todo se crea y se borra en esta corrida — no toca datos reales.
 */
export default async function globalSetup() {
  const supabase = resolveLocalSupabase()
  const admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await wipeStaleE2eEvents(admin)

  const run = randomUUID().slice(0, 8)
  const eventSlug = `e2e-coupon-${run}`
  const eventTitle = `E2E Cupón ${run}`
  const discountCode = `E2ECPN${run.toUpperCase()}`
  // Segundo escenario: el cupón que CIERRA la pasarela y sólo se paga a mano,
  // sobre un evento con precio manual propio. Es la forma de
  // `ONLY-PITBULL-EFC2026` en Pitbull Classic (100.000 de lista / 92.500 manual
  // / 85.000 pactado), y era la única combinación del catálogo sin cobertura:
  // el cupón de arriba habilita Mercado Pago, así que nunca ejercitó el salto
  // automático de canal ni la recotización del canal manual.
  const manualOnlyEventSlug = `e2e-manual-only-${run}`
  const manualOnlyEventTitle = `E2E Solo Manual ${run}`
  const manualOnlyDiscountCode = `E2EEFC${run.toUpperCase()}`

  const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const endsAt = new Date(Date.now() + 31 * 86_400_000).toISOString()
  const { data: event, error: eventError } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug: eventSlug,
      title: eventTitle,
      venue: 'QA Gym',
      location: 'CABA',
      price: 75000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('id')
    .single()
  if (eventError) throw new Error(`No se pudo crear el evento de QA: ${eventError.message}`)

  // `manual_price` es lo que hace distinto a este evento: el canal manual cotiza
  // 92.500 y no los 100.000 de lista, así que el descuento del cupón se calcula
  // contra otra base según el medio elegido.
  const { data: manualOnlyEvent, error: manualOnlyEventError } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug: manualOnlyEventSlug,
      title: manualOnlyEventTitle,
      venue: 'QA Gym',
      location: 'CABA',
      price: 100000,
      manual_price: 92500,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('id')
    .single()
  if (manualOnlyEventError) {
    throw new Error(`No se pudo crear el evento solo-manual de QA: ${manualOnlyEventError.message}`)
  }

  const { data: athlete, error: athleteError } = await admin
    .from('athletes')
    .insert({
      organization_id: ORG_ID,
      full_name: `E2E Cupón ${run}`,
      document_id: String(91_000_000 + Math.floor(Math.random() * 8_999_999)),
      email: `e2e-coupon-${run}@pluarg.test`,
      status: 'registrado',
      birth_date: '1994-05-18',
      sex: 'Masculino',
      gym: 'PLU Test Team',
      phone: '+5491100000000',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'CABA',
      // Perfil competitivo precargado: el checkout de competencia no exige
      // llenar división/categoría/peso si el atleta ya los trae.
      division: 'Open',
      category: 'Raw',
      estimated_weight: 93,
      email_verified_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (athleteError) throw new Error(`No se pudo crear el atleta de QA: ${athleteError.message}`)

  const { error: discountError } = await admin.rpc('staff_upsert_discount_code', {
    p_code: {
      organizationId: ORG_ID,
      code: discountCode,
      kind: 'fixed_price',
      fixedPrice: 50000,
      fixedPriceManual: 50000,
      appliesTo: 'registration',
      eventId: event.id,
      active: true,
      manualChannels: ['bank_transfer'],
      mercadoPagoEnabled: true,
    },
    p_actor: 'e2e:checkout-coupon',
  })
  if (discountError) throw new Error(`No se pudo crear el cupón de QA: ${discountError.message}`)

  const { error: manualOnlyDiscountError } = await admin.rpc('staff_upsert_discount_code', {
    p_code: {
      organizationId: ORG_ID,
      code: manualOnlyDiscountCode,
      kind: 'fixed_price',
      fixedPrice: 85000,
      fixedPriceManual: 85000,
      appliesTo: 'registration',
      eventId: manualOnlyEvent.id,
      active: true,
      manualChannels: ['bank_transfer', 'cash_pitbull'],
      // El punto del escenario: la pasarela queda prohibida por el código.
      mercadoPagoEnabled: false,
    },
    p_actor: 'e2e:checkout-coupon',
  })
  if (manualOnlyDiscountError) {
    throw new Error(
      `No se pudo crear el cupón solo-manual de QA: ${manualOnlyDiscountError.message}`,
    )
  }

  // La sesión del atleta se firma con AUTH_SECRET: tiene que ser la MISMA que
  // usa el server que levanta el webServer de Playwright (playwright.config.js).
  process.env.SUPABASE_URL = supabase.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = supabase.serviceRoleKey
  process.env.AUTH_SECRET = 'e2e-checkout-coupon-secret'
  const { ATHLETE_SESSION_COOKIE_NAME, createAthleteSession } = await import(
    '../server/services/athleteSessionService.js'
  )
  const session = await createAthleteSession({
    client: admin,
    athleteId: athlete.id,
    req: { get: () => undefined, ip: '127.0.0.1' },
  })

  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true })
  await writeFile(
    AUTH_STATE_PATH,
    JSON.stringify({
      cookies: [
        {
          name: ATHLETE_SESSION_COOKIE_NAME,
          value: session.token,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      ],
      origins: [],
    }),
    'utf8',
  )

  // La migración de suspensión dejó `ticket_enabled = false` en la org QA.
  // Sin esto la API responde checkout cerrado y la página no llega al form,
  // aunque el flag de Vite y `rules.ticketsEnabled` estén bien.
  const { error: ticketToggleError } = await admin.rpc('staff_set_platform_feature_toggle', {
    p_feature: 'ticket',
    p_enabled: true,
    p_actor: 'e2e:ticket-sales',
  })
  if (ticketToggleError) {
    throw new Error(`No se pudo abrir la venta de entradas: ${ticketToggleError.message}`)
  }
  const { error: ticketManualError } = await admin.rpc('staff_set_platform_feature_toggle', {
    p_feature: 'ticket_manual',
    p_enabled: true,
    p_actor: 'e2e:ticket-sales',
  })
  if (ticketManualError) {
    throw new Error(`No se pudo abrir el canal manual de entradas: ${ticketManualError.message}`)
  }

  const ticketEventSlug = `e2e-tickets-${run}`
  const ticketEventTitle = `E2E Entradas ${run}`

  const { data: ticketEvent, error: ticketEventError } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug: ticketEventSlug,
      title: ticketEventTitle,
      venue: 'QA Gym',
      location: 'CABA',
      price: 75000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
      // `events` no tiene columna `pricing`: la habilitación de venta vive en
      // `rules`, que es de donde la lee `create_ticket_order_v2`. Con la clave
      // mal puesta el insert fallaba y el E2E de entradas no llegaba a correr.
      rules: {
        ticketsEnabled: true,
        ticketAddons: [
          {
            id: 'e2e-addon-remera',
            label: 'Remera del evento',
            description: 'Talle único',
            price: 8000,
            redeemLabel: 'Retirá en merch',
            enabled: true,
            sortOrder: 1,
          },
        ],
      },
    })
    .select('id')
    .single()
  if (ticketEventError) {
    throw new Error(`No se pudo crear el evento de entradas de QA: ${ticketEventError.message}`)
  }

  const { data: ticketTypes, error: ticketTypesError } = await admin
    .from('ticket_types')
    .insert([
      {
        event_id: ticketEvent.id,
        name: 'Entrenadores',
        // Cupo holgado: el spec RPC de credenciales y las compras UI de
        // entrenador comparten este evento. El caso de agotado vive en otro.
        quota: 12,
        price: 10000,
        sort_order: 1,
        active: true,
      },
      {
        event_id: ticketEvent.id,
        name: 'Público general',
        price: 20000,
        sort_order: 2,
        active: true,
      },
      {
        event_id: ticketEvent.id,
        name: 'VIP',
        quota: 20,
        price: 35000,
        sort_order: 3,
        active: true,
      },
    ])
    .select('id, name')
  if (ticketTypesError) {
    throw new Error(`No se pudieron crear los tipos de entrada de QA: ${ticketTypesError.message}`)
  }

  const coachTypeId = ticketTypes.find((type) => type.name === 'Entrenadores')?.id
  const generalTypeId = ticketTypes.find((type) => type.name === 'Público general')?.id
  const vipTypeId = ticketTypes.find((type) => type.name === 'VIP')?.id
  if (!coachTypeId || !generalTypeId || !vipTypeId) {
    throw new Error('Faltó crear alguno de los tipos de entrada de QA.')
  }

  // Subcategorías: el entrenador paga una vez y recibe DOS credenciales -- la
  // de espectador para la tribuna y la de ENTRENADOR que abre la entrada en
  // calor. El público general recibe una sola.
  const { error: credentialsError } = await admin.rpc('staff_merge_ticket_type_credentials', {
    p_event_slug: ticketEventSlug,
    p_credentials: [
      {
        ticketTypeId: coachTypeId,
        credentials: [
          { label: 'Espectador', zoneScopes: ['gate_tickets'] },
          { label: 'ENTRENADOR', zoneScopes: ['athletes_coaches'] },
        ],
      },
      {
        ticketTypeId: generalTypeId,
        credentials: [{ label: 'Entrada general', zoneScopes: ['gate_tickets'] }],
      },
      {
        ticketTypeId: vipTypeId,
        credentials: [{ label: 'VIP', zoneScopes: ['gate_tickets'] }],
      },
    ],
  })
  if (credentialsError) {
    throw new Error(
      `No se pudieron crear las credenciales de entrada de QA: ${credentialsError.message}`,
    )
  }

  const ticketAddonId = 'e2e-addon-remera'
  const ticketAddonLabel = 'Remera del evento'
  const { error: vipAddonError } = await admin.from('ticket_type_included_addons').insert({
    ticket_type_id: vipTypeId,
    addon_id: ticketAddonId,
  })
  if (vipAddonError) {
    throw new Error(`No se pudo incluir la remera en VIP: ${vipAddonError.message}`)
  }

  // Evento aparte para el E2E de agotado: quota 1, un solo tipo. Si
  // compartiera el de entrenadores, el spec RPC y este se pisarían.
  const soldOutEventSlug = `e2e-tickets-soldout-${run}`
  const soldOutEventTitle = `E2E Entradas agotadas ${run}`
  const { data: soldOutEvent, error: soldOutEventError } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug: soldOutEventSlug,
      title: soldOutEventTitle,
      venue: 'QA Gym',
      location: 'CABA',
      price: 15000,
      currency: 'ARS',
      status: 'cupos_limitados',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
      rules: { ticketsEnabled: true },
    })
    .select('id')
    .single()
  if (soldOutEventError) {
    throw new Error(`No se pudo crear el evento de cupo 1: ${soldOutEventError.message}`)
  }

  const { data: soldOutTypes, error: soldOutTypesError } = await admin
    .from('ticket_types')
    .insert([
      {
        event_id: soldOutEvent.id,
        name: 'Público general',
        quota: 1,
        price: 15000,
        sort_order: 1,
        active: true,
      },
    ])
    .select('id, name')
  if (soldOutTypesError) {
    throw new Error(`No se pudo crear el tipo de cupo 1: ${soldOutTypesError.message}`)
  }
  const soldOutTypeId = soldOutTypes[0]?.id

  const { error: soldOutCredentialsError } = await admin.rpc('staff_merge_ticket_type_credentials', {
    p_event_slug: soldOutEventSlug,
    p_credentials: [
      {
        ticketTypeId: soldOutTypeId,
        credentials: [{ label: 'Entrada general', zoneScopes: ['gate_tickets'] }],
      },
    ],
  })
  if (soldOutCredentialsError) {
    throw new Error(
      `No se pudieron crear las credenciales de cupo 1: ${soldOutCredentialsError.message}`,
    )
  }

  // Evento publicado con venta cerrada: la página tiene que decir
  // "Próximamente" aunque el catálogo lo liste.
  const pausedEventSlug = `e2e-tickets-paused-${run}`
  const pausedEventTitle = `E2E Entradas pausadas ${run}`
  const { data: pausedEvent, error: pausedEventError } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug: pausedEventSlug,
      title: pausedEventTitle,
      venue: 'QA Gym',
      location: 'CABA',
      price: 15000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
      rules: { ticketsEnabled: false },
    })
    .select('id')
    .single()
  if (pausedEventError) {
    throw new Error(`No se pudo crear el evento pausado: ${pausedEventError.message}`)
  }

  const { error: pausedTypeError } = await admin.from('ticket_types').insert({
    event_id: pausedEvent.id,
    name: 'Público general',
    price: 15000,
    sort_order: 1,
    active: true,
  })
  if (pausedTypeError) {
    throw new Error(`No se pudo crear el tipo del evento pausado: ${pausedTypeError.message}`)
  }

  const securityStaff = await seedSecurityStaff({
    run,
    eventId: ticketEvent.id,
    eventSlug: ticketEventSlug,
  })

  await writeFile(
    FIXTURE_PATH,
    JSON.stringify({
      run,
      eventSlug,
      eventTitle,
      eventId: event.id,
      athleteId: athlete.id,
      discountCode,
      manualOnlyEventSlug,
      manualOnlyEventTitle,
      manualOnlyEventId: manualOnlyEvent.id,
      manualOnlyDiscountCode,
      ticketEventSlug,
      ticketEventTitle,
      ticketEventId: ticketEvent.id,
      coachTypeId,
      generalTypeId,
      vipTypeId,
      ticketAddonId,
      ticketAddonLabel,
      soldOutEventSlug,
      soldOutEventTitle,
      soldOutEventId: soldOutEvent.id,
      soldOutTypeId,
      pausedEventSlug,
      pausedEventTitle,
      pausedEventId: pausedEvent.id,
      ...securityStaff,
    }),
    'utf8',
  )
}
