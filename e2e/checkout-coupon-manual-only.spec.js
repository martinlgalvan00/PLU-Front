import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { AUTH_STATE_PATH, FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import { acceptCookies, redeemCode } from './redeem-code.js'

/**
 * Cupón que CIERRA Mercado Pago y sólo se paga a mano, sobre un evento con
 * precio manual propio — la forma de `ONLY-PITBULL-EFC2026` en Pitbull Classic.
 *
 * El escenario existía en producción y no en los tests: `checkout-coupon.spec.js`
 * siembra su cupón con `mercadoPagoEnabled: true`, así que nunca ejercitó ni el
 * salto automático de canal (el checkout tiene que colapsar la selección a los
 * canales que el código admite) ni la recotización contra el precio manual.
 *
 * Lo que se protege acá no es la pantalla sino el importe cobrado: la orden que
 * queda en la base tiene que salir al precio pactado y con el código adjunto.
 * Una orden creada al precio manual de lista mientras el checkout anuncia el
 * precio del cupón es cobrar un número distinto del que se mostró.
 *
 * Aritmética del fixture (idéntica a la del evento real):
 *   lista 100.000 · manual 92.500 · pactado por el cupón 85.000
 * Es decir: 7.500 de descuento sobre la base manual, no sobre la de lista.
 */

let fixture
let admin

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

test.use({ storageState: AUTH_STATE_PATH })

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

test.beforeEach(async () => {
  await resetAthletePurchases()
})

test.afterAll(async () => {
  if (admin && fixture) await resetAthletePurchases()
})

/**
 * Una orden abierta por transferencia SIN cupón, al precio manual de lista —
 * el estado en el que queda cualquiera que empezó a inscribirse y no terminó.
 */
async function seedOpenOrderWithoutCode() {
  const { error } = await admin.rpc('create_competition_registration_checkout', {
    p_athlete_id: fixture.athleteId,
    p_event_slug: fixture.manualOnlyEventSlug,
    p_division: 'Open',
    p_category: 'Raw',
    p_bodyweight_kg: 93,
    p_payment_method: 'manual_link',
    p_idempotency_key: randomUUID(),
    p_discount_code: null,
    p_default_price: 100000,
    p_manual_price: 92500,
    p_manual_payment_channel: 'bank_transfer',
    p_currency: null,
  })
  if (error) throw new Error(`No se pudo sembrar la orden abierta: ${error.message}`)
  const seeded = await latestRegistrationOrder()
  expect(seeded?.amount).toBe(92500)
  expect(seeded?.discount_code).toBeNull()
}

const ORDER_COLUMNS =
  'id, amount, discount_code, discount_amount, method, manual_payment_channel, status, cancellation_code'

/** Las últimas órdenes de inscripción del atleta de QA, la más nueva primero. */
async function registrationOrders() {
  const { data, error } = await admin
    .from('athlete_payment_orders')
    .select(ORDER_COLUMNS)
    .eq('athlete_id', fixture.athleteId)
    .eq('concept', 'registration')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(`No se pudo leer la orden: ${error.message}`)
  return data ?? []
}

/** La orden de inscripción más reciente del atleta de QA para ESTE evento. */
async function latestRegistrationOrder() {
  // El atleta de QA también compra en el evento del otro spec: la orden de este
  // escenario es la que quedó en un canal manual con el cupón de acá.
  return (await registrationOrders()).find((row) => row.method === 'manual_link') ?? null
}

/**
 * La misma orden sin filtrar por medio — después de cancelar sigue siendo la
 * que interesa, y así la aserción no depende de que conserve su canal.
 */
async function anyRegistrationOrder() {
  return (await registrationOrders())[0] ?? null
}

test.describe('Inscripción a competencia — cupón sin Mercado Pago', () => {
  test('cobra el precio pactado por transferencia y deja el código en la orden', async ({
    page,
  }) => {
    await page.goto('/mi-cuenta?section=events')
    await acceptCookies(page)

    const eventRow = page.locator('article.account-events-list__row', {
      hasText: fixture.manualOnlyEventTitle,
    })
    await eventRow.getByRole('button', { name: /Inscribirme/i }).click()

    await redeemCode(page, fixture.manualOnlyDiscountCode)

    const appliedBand = page.locator('.register-discount__applied')
    await expect(appliedBand).toContainText(fixture.manualOnlyDiscountCode)
    await expect(appliedBand).toContainText('85.000')

    // El código prohíbe la pasarela: la selección tiene que quedar sólo con los
    // canales que admite. Si Mercado Pago sigue ofrecido, el checkout está
    // por mandar al atleta a un medio que el backend va a rechazar (PLU28).
    await expect(page.getByRole('radio', { name: /mercado pago/i })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /Transferencia bancaria/i })).toBeVisible()

    await page.locator('label.plu-checkout__pill', { hasText: 'Transferencia bancaria' }).click()
    await expect(page.getByRole('radio', { name: /Transferencia bancaria/i })).toBeChecked()

    await page.getByRole('button', { name: /Continuar al pago/i }).click()

    // Avanzar es exactamente lo que el atleta reportó que no podía hacer.
    const transferModal = page.getByRole('dialog', { name: /completar tu inscripción/i })
    await expect(transferModal).toBeVisible()

    // La verdad no está en la pantalla sino en la orden: importe pactado,
    // código adjunto y el descuento calculado contra la base manual.
    const order = await latestRegistrationOrder()
    expect(order, 'no se creó ninguna orden manual').not.toBeNull()
    expect(order.manual_payment_channel).toBe('bank_transfer')
    expect(order.discount_code).toBe(fixture.manualOnlyDiscountCode)
    expect(order.discount_amount).toBe(7500)
    expect(order.amount).toBe(85000)
  })

  /**
   * El estado real en el que quedó la cuenta que reportó el problema: una
   * inscripción empezada por transferencia y nunca terminada, y encima el
   * cupón. La orden abierta se reusa, así que el código tiene que entrar por
   * la recotización (`requote_open_order`) y no por el alta.
   */
  test('aplica el código sobre una orden abierta sin cupón y la recotiza', async ({ page }) => {
    await seedOpenOrderWithoutCode()

    await page.goto('/mi-cuenta?section=events')
    await acceptCookies(page)
    const eventRow = page.locator('article.account-events-list__row', {
      hasText: fixture.manualOnlyEventTitle,
    })
    await eventRow.getByRole('button', { name: /^Elegir otro medio$/i }).click()

    await redeemCode(page, fixture.manualOnlyDiscountCode)
    await expect(page.locator('.register-discount__applied')).toContainText('85.000')

    await page.getByRole('button', { name: /Continuar al pago/i }).click()

    // Sin bloqueo: ni "pago en curso" ni el cartel de método bloqueado.
    await expect(page.getByRole('dialog', { name: /completar tu inscripción/i })).toBeVisible()

    await expect
      .poll(async () => (await latestRegistrationOrder())?.discount_code, { timeout: 15_000 })
      .toBe(fixture.manualOnlyDiscountCode)
    const order = await latestRegistrationOrder()
    expect(order.amount).toBe(85000)
  })
})

/**
 * La salida que faltaba: cerrar la orden abierta desde el checkout.
 *
 * Una inscripción por transferencia que quedó `pendiente` la reusa el checkout
 * hasta que vence (24 h). Con un cupón consumido encima, la redención —única
 * por (código, atleta)— hacía que el mismo código rebotara con PLU22 en el
 * intento siguiente, y no había ninguna acción del atleta que lo destrabara.
 */
/**
 * Deja la pantalla de liquidación de la orden abierta a la vista, que es donde
 * viven las acciones sobre la orden. El cupón se aplica de paso porque en este
 * entorno es lo que destraba los canales manuales.
 */
async function openSettleScreen(page) {
  await page.goto('/mi-cuenta?section=events')
  await acceptCookies(page)
  const eventRow = page.locator('article.account-events-list__row', {
    hasText: fixture.manualOnlyEventTitle,
  })
  await eventRow.getByRole('button', { name: /^Elegir otro medio$/i }).click()

  await redeemCode(page, fixture.manualOnlyDiscountCode)
  await page.getByRole('button', { name: /Continuar al pago/i }).click()

  const modal = page.getByRole('dialog', { name: /completar tu inscripción/i })
  await expect(modal).toBeVisible()
  await expect
    .poll(async () => (await latestRegistrationOrder())?.discount_code, { timeout: 15_000 })
    .toBe(fixture.manualOnlyDiscountCode)
  await modal.getByRole('button', { name: /cerrar modal/i }).click()
  await expect(modal).toBeHidden()
}

test.describe('Orden abierta por transferencia — el atleta la cancela', () => {
  test('cancela, recupera el cupón y puede abrir otra orden', async ({ page }) => {
    await seedOpenOrderWithoutCode()
    // El cupón queda aplicado sobre la orden abierta, para probar que la
    // cancelación devuelve la redención y no la deja consumida.
    await openSettleScreen(page)

    await page.getByRole('button', { name: /^Cancelar esta orden$/i }).click()

    // El acuse sale donde se hizo el clic, no en un toast que se va.
    await expect(page.locator('.form-submit-notice')).toContainText(/cancelamos tu orden/i, {
      timeout: 15_000,
    })

    // La orden queda cerrada con su motivo, y la inscripción no queda viva.
    await expect
      .poll(async () => (await anyRegistrationOrder())?.status, { timeout: 15_000 })
      .toBe('cancelado')
    const cancelled = await anyRegistrationOrder()
    expect(cancelled.cancellation_code).toBe('cancelled_by_athlete')
    // El cupón volvió: sin esto el próximo intento rebota con PLU22.
    expect(cancelled.discount_code).toBeNull()
    const { data: redemptions } = await admin
      .from('discount_code_redemptions')
      .select('id')
      .eq('payment_order_id', cancelled.id)
    expect(redemptions ?? []).toHaveLength(0)
    const { data: regs } = await admin
      .from('event_registrations')
      .select('status')
      .eq('payment_order_id', cancelled.id)
    expect((regs ?? []).every((row) => row.status === 'cancelada')).toBe(true)
  })

  /**
   * La guarda que importa: con un comprobante adjunto la orden ya es trabajo de
   * Finanzas. Cancelar tiene que fallar Y decir por qué — un "no se puede"
   * mudo es el bug original.
   */
  test('con comprobante adjunto explica por qué no puede cancelar', async ({ page }) => {
    await seedOpenOrderWithoutCode()
    await openSettleScreen(page)

    // El comprobante se adjunta con la pantalla ya abierta: así el botón sigue
    // en pantalla y quien rechaza es la guarda del servidor, que es la que
    // tiene que explicarse.
    const order = await latestRegistrationOrder()
    const { error } = await admin
      .from('athlete_payment_orders')
      .update({
        payment_proof_path: 'qa/comprobante-e2e.pdf',
        payment_proof_uploaded_at: new Date().toISOString(),
      })
      .eq('id', order.id)
    if (error) throw new Error(`No se pudo simular el comprobante: ${error.message}`)

    await page.getByRole('button', { name: /^Cancelar esta orden$/i }).click()

    await expect(page.locator('.form-submit-error')).toContainText(/comprobante/i, {
      timeout: 15_000,
    })
    // Y la orden sigue viva: la guarda no es cosmética.
    expect((await anyRegistrationOrder())?.status).toBe('pendiente')
  })
})

/**
 * El perfil competitivo incompleto — división, categoría y peso en null en la
 * ficha del atleta. Es el estado de la cuenta que reportó "el botón no hace
 * nada": `validateCompetitionForm` exige los tres, y el submit corta antes de
 * llamar a la API.
 *
 * Lo que se protege es que el corte SE VEA. Un CTA que no responde y no dice
 * por qué no tiene salida: el atleta no sabe que le falta cargar su división,
 * y desde la pantalla de pago no hay nada que se lo indique.
 */
test.describe('Inscripción a competencia — perfil competitivo incompleto', () => {
  test.beforeEach(async () => {
    const { error } = await admin
      .from('athletes')
      .update({ division: null, category: null, estimated_weight: null })
      .eq('id', fixture.athleteId)
    if (error) throw new Error(`No se pudo vaciar el perfil: ${error.message}`)
  })

  test.afterEach(async () => {
    await admin
      .from('athletes')
      .update({ division: 'Open', category: 'Raw', estimated_weight: 93 })
      .eq('id', fixture.athleteId)
  })

  test('el CTA explica qué falta en vez de no hacer nada', async ({ page }) => {
    await page.goto('/mi-cuenta?section=events')
    await acceptCookies(page)
    const eventRow = page.locator('article.account-events-list__row', {
      hasText: fixture.manualOnlyEventTitle,
    })
    await eventRow.getByRole('button', { name: /Inscribirme/i }).click()

    await redeemCode(page, fixture.manualOnlyDiscountCode)
    await page.locator('label.plu-checkout__pill', { hasText: 'Transferencia bancaria' }).click()

    await page.getByRole('button', { name: /Continuar al pago/i }).click()

    // Sin orden creada: el submit corta del lado del cliente, y está bien que
    // corte. Lo que no puede pasar es que corte en silencio.
    // El cartel tiene que salir donde el atleta hizo clic —`.form-submit-error`
    // se pinta justo encima de la barra de pago—, no sólo junto al campo, que
    // en esta pantalla queda scrolleado varias alturas más arriba.
    const submitError = page.locator('.form-submit-error')
    await expect(submitError).toBeVisible({ timeout: 10_000 })
    await expect(submitError).toContainText(/peso|división|categoría/i)

    // Y el campo que falta tiene que quedar a la vista, no fuera del viewport.
    const weight = page.locator('[name="estimatedWeight"]')
    await expect(weight).toBeInViewport()

    // Sin orden creada: el submit corta del lado del cliente, y está bien que
    // corte. Lo que no puede pasar es que corte en silencio.
    expect(await latestRegistrationOrder()).toBeNull()
  })
})
