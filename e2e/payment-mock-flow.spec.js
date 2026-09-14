import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { AUTH_STATE_PATH, FIXTURE_PATH } from './global-setup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'
import { acceptCookies } from './ticket-purchase-helpers.js'

let fixture
let admin

test.use({ storageState: AUTH_STATE_PATH })

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

async function resetAthletePurchases() {
  const { data: orders, error } = await admin
    .from('athlete_payment_orders')
    .select('id')
    .eq('athlete_id', fixture.athleteId)
  if (error) throw new Error(`No se pudieron leer las órdenes E2E: ${error.message}`)

  const orderIds = (orders ?? []).map((order) => order.id)
  if (!orderIds.length) return

  const { error: redemptionsError } = await admin
    .from('discount_code_redemptions')
    .delete()
    .in('payment_order_id', orderIds)
  if (redemptionsError) throw new Error(`No se pudieron borrar redenciones E2E: ${redemptionsError.message}`)

  const { error: attemptsError } = await admin
    .from('embedded_payment_attempts')
    .delete()
    .in('order_id', orderIds)
  if (attemptsError) throw new Error(`No se pudieron borrar intentos E2E: ${attemptsError.message}`)

  const { error: registrationsError } = await admin
    .from('event_registrations')
    .delete()
    .in('payment_order_id', orderIds)
  if (registrationsError) {
    throw new Error(`No se pudieron borrar inscripciones E2E: ${registrationsError.message}`)
  }

  // Los cobros mock dejan un asiento canónico que referencia la orden. Se
  // limpia antes de la orden para que cada caso (aprobado/rechazado/pendiente)
  // empiece aislado y no dependa del orden de ejecución de Playwright.
  const { error: paymentsError } = await admin
    .from('athlete_payments')
    .delete()
    .in('order_id', orderIds)
  if (paymentsError) throw new Error(`No se pudieron borrar pagos E2E: ${paymentsError.message}`)

  const { error: ordersError } = await admin.from('athlete_payment_orders').delete().in('id', orderIds)
  if (ordersError) throw new Error(`No se pudieron borrar órdenes E2E: ${ordersError.message}`)
}

async function latestOrder() {
  const { data, error } = await admin
    .from('athlete_payment_orders')
    .select('id, status, method')
    .eq('athlete_id', fixture.athleteId)
    .eq('organization_id', ORG_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la orden E2E: ${error.message}`)
  return data
}

async function openMercadoPagoCheckout(page) {
  await page.goto('/mi-cuenta?section=events')
  await acceptCookies(page)

  const eventRow = page.locator('article.account-events-list__row', {
    hasText: fixture.eventTitle,
  })
  await eventRow.getByRole('button', { name: /Inscribirme/i }).click()

  const mercadoPago = page.getByRole('radio', { name: /mercado pago/i })
  await expect(mercadoPago).toBeVisible({ timeout: 15_000 })
  if (!(await mercadoPago.isChecked())) {
    await page.locator('label.plu-checkout__pill', { hasText: 'Mercado Pago' }).click()
  }
  await expect(mercadoPago).toBeChecked()

  await page.getByRole('button', { name: /Continuar al pago/i }).click()
  await expect(page.locator('.mp-embedded-checkout')).toBeVisible({ timeout: 20_000 })
}

test.describe('Checkout Mercado Pago mock', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })

  test.beforeEach(async () => {
    await resetAthletePurchases()
  })

  test.afterAll(async () => {
    await resetAthletePurchases()
  })

  test('un pago aprobado acredita la orden y confirma la inscripción', async ({ page }) => {
    await openMercadoPagoCheckout(page)

    const paymentResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/payments/embedded/process') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /^Confirmar pago$/i }).click()
    expect((await paymentResponse).ok(), 'POST /api/payments/embedded/process').toBeTruthy()

    await expect(page.locator('.mp-embedded-checkout__result--approved')).toBeVisible()
    await expect.poll(async () => (await latestOrder())?.status).toBe('aprobado')

    const order = await latestOrder()
    const { data: registration, error } = await admin
      .from('event_registrations')
      .select('status')
      .eq('payment_order_id', order.id)
      .maybeSingle()
    if (error) throw new Error(`No se pudo leer la inscripción acreditada: ${error.message}`)
    expect(registration?.status).toMatch(/pagada|confirmada/)
  })

  test('un rechazo no acredita y ofrece iniciar una inscripción nueva', async ({ page }) => {
    await openMercadoPagoCheckout(page)
    await page.getByRole('button', { name: /^Rechazado$/i }).click()

    await expect(page.locator('.register-settle__rejected')).toBeVisible()
    await expect.poll(async () => (await latestOrder())?.status).toBe('rechazado')
    await expect(page.getByRole('button', { name: /Volver a inscribirme/i })).toBeVisible()
  })

  test('un pago pendiente no acredita hasta la confirmación canónica', async ({ page }) => {
    await openMercadoPagoCheckout(page)
    await page.getByRole('button', { name: /^Pendiente$/i }).click()

    await expect(page.locator('.mp-embedded-checkout__result--pending')).toBeVisible()
    await expect.poll(async () => (await latestOrder())?.status).toBe('pendiente')

    const notifyResponse = page.waitForResponse(
      (response) => response.url().includes('/api/payments/mock/notify') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Forzar acreditación/i }).click()
    expect((await notifyResponse).ok(), 'POST /api/payments/mock/notify').toBeTruthy()
    await expect.poll(async () => (await latestOrder())?.status).toBe('aprobado')
  })
})
