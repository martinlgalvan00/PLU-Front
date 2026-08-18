import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

describe('features productivas contra el catalogo real de Supabase', () => {
  const admin = createSupabaseTestClient()
  const target = listen(
    createApp({
      supabaseAdmin: admin,
      env: {
        ...process.env,
        APP_PRODUCTION: 'true',
        PAYMENTS_MOCK: 'false',
      },
    }),
  )

  afterAll(async () => {
    await target.close()
  })

  // `APP_PRODUCTION` ya no gatea el catálogo público (ver "remove APP_PRODUCTION
  // references"; server/lib/featureAvailability.js#filterPublicMembershipPlans
  // quedó como no-op a propósito) — el débito automático se publica igual que
  // la afiliación one-time. Cuál de los dos modos hay cargado es decisión
  // operativa: el seed de CI trae los dos, la base hosteada hoy sólo one_time.
  it('publica el catalogo de afiliacion que tenga cargado, con precio y moneda', async () => {
    const response = await fetch(`${target.url}/api/payments/plans`)
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.plans.some((plan) => plan.collectionMode === 'one_time')).toBe(true)
    for (const plan of body.plans) {
      expect(plan.price, `plan ${plan.code} sin precio`).toBeGreaterThan(0)
      expect(plan.currency, `plan ${plan.code} sin moneda`).toBeTruthy()
    }
  })

  // Los importes se editan desde Administración (pricing catalog), así que este
  // test no fija números: verifica que el catálogo quede *coherente*. El caso
  // que rompe en producción es la promo cargada a medias — la columna
  // `manual_price` con un valor y `rules` con otro (o sin él): la landing
  // muestra un precio y la base cobra el otro. La promo concreta del seed se
  // verifica sobre el archivo, en tests/pitbullRegistrationPriceMigration.test.js.
  it('publica Pitbull Classic con precios coherentes entre columnas, rules y combo', async () => {
    const eventResult = await admin
      .from('events')
      .select('id, slug, price, manual_price, currency, status, published, rules')
      .eq('slug', 'pitbull-classic-2026')
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)

    const event = eventResult.data
    expect(event).toMatchObject({
      slug: 'pitbull-classic-2026',
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
    })
    expect(event.price).toBeGreaterThan(0)
    expect(event.rules.membershipPrice).toBe(event.price)
    if (event.manual_price != null) {
      expect(event.manual_price).toBeLessThanOrEqual(event.price)
      expect(event.rules.membershipManualPrice).toBe(event.manual_price)
    }

    const comboResult = await admin
      .from('event_combo_offers')
      .select('price, manual_price, currency, active')
      .eq('event_id', event.id)
      .single()
    if (comboResult.error) throw new Error(comboResult.error.message)

    const combo = comboResult.data
    expect(combo).toMatchObject({ currency: 'ARS', active: true })
    expect(combo.price).toBeGreaterThan(0)
    expect(event.rules.comboPrice).toBe(combo.price)
    if (combo.manual_price != null) {
      expect(combo.manual_price).toBeLessThanOrEqual(combo.price)
      expect(event.rules.comboManualPrice).toBe(combo.manual_price)
    }
  })
})
