import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'

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
    }),
    'utf8',
  )
}
