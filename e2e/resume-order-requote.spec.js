import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH, FIXTURE_PATH } from './global-setup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'

/**
 * El incidente reportado, por las DOS puertas que llevan a la misma pantalla.
 *
 * Con una orden abierta cotizada por un código, el atleta canjea otro y el
 * checkout anuncia el precio nuevo. Al confirmar, la orden tiene que cobrar ESE
 * precio — no el del código con el que nació.
 *
 * `20261019130000_resumed_order_requotes_its_code.sql` arregló la RPC y su smoke
 * (`supabase/tests/resumed_order_requote_flow.sql`) lo prueba contra la base. Lo
 * que ninguno de los dos cubre es cómo se LLEGA a esa pantalla, y ahí está la
 * diferencia que reportó QA: desde "Elegir otro medio" el checkout entra con
 * `checkoutIntent: 'change_method'`, y desde el CTA principal ("Continuar
 * pago") entra sin ningún intent. Este archivo corre el mismo trámite por las
 * dos puertas y afirma sobre la ORDEN real, no sobre lo que dice la pantalla.
 *
 * La orden abierta se siembra por RPC —la misma que usa la ruta de Express— en
 * vez de crearla por la UI: lo que se está midiendo es el tramo de recotización,
 * y armar la primera compra a mano metía en el medio el modal de transferencia
 * y el interruptor de canal manual, que no tienen nada que ver con esto.
 */

const LIST_PRICE = 75000
const FIRST_PRICE = 50000
const REQUOTED_PRICE = 65000

let fixture
let admin
/** Código nuevo: sólo Mercado Pago, como el del incidente. */
let requoteCode

test.use({ storageState: AUTH_STATE_PATH })

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  requoteCode = `${fixture.discountCode}MP`
  const { error } = await admin.rpc('staff_upsert_discount_code', {
    p_code: {
      organizationId: ORG_ID,
      code: requoteCode,
      kind: 'fixed_price',
      fixedPrice: REQUOTED_PRICE,
      appliesTo: 'registration',
      eventId: fixture.eventId,
      active: true,
      manualChannels: [],
      mercadoPagoEnabled: true,
    },
    p_actor: 'e2e:resume-requote',
  })
  if (error) throw new Error(`No se pudo crear el segundo cupón: ${error.message}`)
})

test.afterAll(async () => {
  if (!admin || !requoteCode) return
  await resetAthletePurchases()
  await admin.from('discount_codes').delete().eq('organization_id', ORG_ID).eq('code', requoteCode)
})

/**
 * Cada recorrido arranca sin compra previa: la redención es única por
 * (código, atleta), así que sin este reset el segundo test chocaría con el
 * PLU22 del primero en vez de probar lo suyo.
 */
async function resetAthletePurchases() {
  const { data: orders } = await admin
    .from('athlete_payment_orders')
    .select('id')
    .eq('athlete_id', fixture.athleteId)
  const ids = (orders ?? []).map((order) => order.id)
  if (!ids.length) return
  await admin.from('discount_code_redemptions').delete().in('payment_order_id', ids)
  await admin.from('event_registrations').delete().in('payment_order_id', ids)
  await admin.from('athlete_payment_orders').delete().in('id', ids)
}

/** La orden viva del atleta, tal como la ve Finanzas. */
async function openOrder() {
  const { data } = await admin
    .from('athlete_payment_orders')
    .select('id, amount, discount_code, discount_amount, method, status')
    .eq('athlete_id', fixture.athleteId)
    .in('status', ['pendiente', 'validacion_manual'])
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

test.beforeEach(async () => {
  await resetAthletePurchases()
})

/** Orden abierta por Mercado Pago, cotizada con el primer código. */
async function seedOpenOrder() {
  const { error } = await admin.rpc('create_competition_registration_checkout', {
    p_athlete_id: fixture.athleteId,
    p_event_slug: fixture.eventSlug,
    p_division: 'Open',
    p_category: 'Raw',
    p_bodyweight_kg: 93,
    p_payment_method: 'mercado_pago',
    p_idempotency_key: randomUUID(),
    p_discount_code: fixture.discountCode,
    p_default_price: LIST_PRICE,
    p_manual_price: null,
    p_manual_payment_channel: null,
    p_currency: null,
  })
  if (error) throw new Error(`No se pudo sembrar la orden abierta: ${error.message}`)
  const seeded = await openOrder()
  expect(seeded?.amount).toBe(FIRST_PRICE)
  expect(seeded?.discount_code).toBe(fixture.discountCode)
}

async function acceptCookies(page) {
  const acceptAll = page.getByRole('button', { name: /^Aceptar todo$/i })
  await acceptAll
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => acceptAll.click())
    .catch(() => {})
}

async function openEventRow(page) {
  await page.goto('/mi-cuenta?section=events')
  await acceptCookies(page)
  return page.locator('article.account-events-list__row', { hasText: fixture.eventTitle })
}

async function redeemCode(page, code) {
  const applied = page.locator('.register-discount__applied').first()
  const toggle = page.getByRole('button', { name: /^Tengo un código$/i })
  const field = page.getByLabel(/^Código$/i)

  // Los tres estados posibles de la banda al montar. Se espera a que resuelva
  // en alguno antes de decidir: la pantalla de la orden abierta repuebla el
  // cupón después del primer frame, así que mirarla antes daba "no hay nada
  // aplicado" y el campo aparecía tapado un instante después.
  await Promise.race([
    applied.waitFor({ state: 'visible' }),
    toggle.waitFor({ state: 'visible' }),
    field.waitFor({ state: 'visible' }),
  ])

  // Con OTRO código ya aplicado —el caso de la orden abierta— el atleta lo saca
  // con "Quitar" antes de escribir el nuevo. Es literalmente el recorrido de las
  // capturas de QA.
  if (await applied.isVisible().catch(() => false)) {
    if ((await applied.innerText()).includes(code)) return
    await page.getByRole('button', { name: /^Quitar$/i }).click()
    await expect(page.locator('.register-discount__applied')).toHaveCount(0)
  }

  await Promise.race([toggle.waitFor({ state: 'visible' }), field.waitFor({ state: 'visible' })])
  if (await toggle.isVisible().catch(() => false)) await toggle.click()
  await field.fill(code)
  await page.getByRole('button', { name: /^Canjear$/i }).click()
  await expect(page.locator('.register-discount__applied')).toContainText(code, {
    timeout: 15_000,
  })
  const reveal = page.getByRole('dialog', { name: /precio promocional|descuento/i })
  if (await reveal.isVisible().catch(() => false)) {
    await reveal.getByRole('button', { name: /Seguir con el pago/i }).click()
    await expect(reveal).toBeHidden()
  }
}

/**
 * El tramo que importa: canjear el código nuevo sobre la orden abierta y
 * confirmar. Se afirma la ORDEN, no el cartel — y de paso qué mandó el
 * navegador, que es donde se separan las dos puertas.
 */
async function requoteAndConfirm(page) {
  await redeemCode(page, requoteCode)
  const band = page.locator('.register-discount__applied')
  await expect(band).toContainText(requoteCode)
  await expect(band).toContainText('65.000')

  const request = page.waitForRequest(
    (candidate) =>
      candidate.url().includes('/api/athletes/me/registrations') &&
      candidate.method() === 'POST',
    { timeout: 20_000 },
  )
  await page.getByRole('button', { name: /Continuar al pago/i }).click()
  const sent = JSON.parse((await request).postData() ?? '{}')
  expect(sent.discountCode).toBe(requoteCode)

  await expect
    .poll(async () => (await openOrder())?.discount_code, { timeout: 15_000 })
    .toBe(requoteCode)
  const order = await openOrder()
  expect(order?.amount).toBe(REQUOTED_PRICE)
}

test.describe('Orden abierta: se recotiza con el código de ESTE pedido', () => {
  test('entrando por "Elegir otro medio" (Mi cuenta > Torneos)', async ({ page }) => {
    await seedOpenOrder()
    const row = await openEventRow(page)
    await row.getByRole('button', { name: /^Elegir otro medio$/i }).click()
    await requoteAndConfirm(page)
  })

  /**
   * El CTA no manda `checkoutIntent`, así que abre la orden en su pantalla de
   * cobro en vez del selector de medio. Lo que se afirma acá es el aterrizaje:
   * la orden viva con su importe, no el formulario de inscripción en blanco —
   * que es donde caía antes de rehidratarla. La recotización la cubren los
   * otros dos recorridos, que sí llegan al selector.
   */
  test('entrando por el CTA principal "Continuar pago"', async ({ page }) => {
    await seedOpenOrder()
    const row = await openEventRow(page)
    await row.getByRole('button', { name: /^Continuar pago$/i }).click()

    await expect(page.getByText(/Completá el pago para confirmar tu lugar/i).first()).toBeVisible()
    await expect(page.getByText('$ 50.000').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Canjear$/i })).toHaveCount(0)
  })

  /**
   * La orden abierta sobrevive a la recarga.
   *
   * `createdOrder` es estado en memoria: antes, entrando de nuevo —recargando,
   * desde otra pestaña, o desde el listado de torneos— la orden era invisible
   * para el checkout, el `checkoutIntent` de "Elegir otro medio" se descartaba
   * por no tener a qué aplicarse, y el atleta aterrizaba en el formulario de
   * inscripción completo en lugar de en su pago pendiente.
   */
  test('tras recargar, "Elegir otro medio" abre la orden y no el formulario', async ({ page }) => {
    await seedOpenOrder()
    const row = await openEventRow(page)
    await row.getByRole('button', { name: /^Elegir otro medio$/i }).click()
    await expect(page.getByText(/Tu orden sigue pendiente/i)).toBeVisible()
    // Y no el formulario de inscripción desde cero, que es donde caía antes.
    // La ausencia de "División" ya no sirve para distinguirlos: la pantalla de
    // la orden ahora muestra los campos competitivos a propósito, para que
    // quien se equivocó de categoría pueda corregirla sin cancelar el pago
    // (ver `competitionFieldsSection` en RegisterPage.jsx). El marcador que
    // sigue siendo exclusivo de esta pantalla es su contenedor.
    await expect(page.locator('.register-competition-form--change-method')).toHaveCount(1)
  })

  /**
   * El recorrido de las capturas de QA: la orden se crea EN ESTA SESIÓN, así
   * que `createdOrder` vive en memoria y el checkout entra en la pantalla
   * "Cómo pagás / Tu orden sigue pendiente" (`changingMethod`) — la única de
   * las tres que no se puede alcanzar con una recarga, y la que reportaron
   * cobrando el precio del código viejo.
   */
  test('sin recargar, sobre la pantalla "Tu orden sigue pendiente"', async ({ page }) => {
    const row = await openEventRow(page)
    await row.getByRole('button', { name: /Inscribirme/i }).click()

    await redeemCode(page, fixture.discountCode)
    await expect(page.locator('.register-discount__applied')).toContainText('50.000')
    await page.getByRole('button', { name: /Continuar al pago/i }).click()

    await expect
      .poll(async () => (await openOrder())?.amount, { timeout: 20_000 })
      .toBe(FIRST_PRICE)

    // "Elegir otro medio" de la pantalla de cobro: no navega ni recarga, sólo
    // abre el selector sobre la orden viva.
    await page.getByRole('button', { name: /^Elegir otro medio$/i }).click()
    await expect(page.getByText(/Tu orden sigue pendiente/i)).toBeVisible()

    await requoteAndConfirm(page)
  })
})
