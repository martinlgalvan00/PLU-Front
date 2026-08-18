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
  // la afiliación one-time.
  it('publica afiliacion one-time y debito automatico', async () => {
    const response = await fetch(`${target.url}/api/payments/plans`)
    const body = await response.json()

    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.plans.some((plan) => plan.collectionMode === 'one_time')).toBe(true)
    expect(body.plans.some((plan) => plan.collectionMode === 'recurring')).toBe(true)
  })

  it('publica Pitbull Classic en ARS 85.000 (75.000 manual) y el combo en ARS 170.000 (120.000 manual)', async () => {
    const eventResult = await admin
      .from('events')
      .select('id, slug, price, manual_price, currency, status, published, rules')
      .eq('slug', 'pitbull-classic-2026')
      .single()
    if (eventResult.error) throw new Error(eventResult.error.message)

    expect(eventResult.data).toMatchObject({
      slug: 'pitbull-classic-2026',
      price: 85000,
      manual_price: 75000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
    })
    expect(eventResult.data.rules).toMatchObject({
      membershipPrice: 85000,
      membershipManualPrice: 75000,
      comboPrice: 170000,
      comboManualPrice: 120000,
    })

    const comboResult = await admin
      .from('event_combo_offers')
      .select('price, manual_price, currency, active')
      .eq('event_id', eventResult.data.id)
      .single()
    if (comboResult.error) throw new Error(comboResult.error.message)

    expect(comboResult.data).toMatchObject({
      price: 170000,
      manual_price: 120000,
      currency: 'ARS',
      active: true,
    })
  })
})
