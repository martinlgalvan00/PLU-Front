import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './admin-helpers.js'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import { buildAdminEventPath } from '../src/lib/adminEventRoute.js'

let fixture
let admin

test.describe('Panel de eventos: edición y medios de cobro', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000, retries: 1 })

  test.beforeAll(async () => {
    fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
    const supabase = resolveLocalSupabase()
    admin = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  })

  async function saveEvent(page) {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/events/upsert') && candidate.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /^Guardar cambios$/i }).click()
    const result = await response
    expect(result.ok(), await result.text()).toBeTruthy()
    await expect(page.getByRole('button', { name: /^Guardar cambios$/i })).toBeDisabled({
      timeout: 20_000,
    })
  }

  async function storedEvent(slug) {
    const { data, error } = await admin
      .from('events')
      .select('venue, payment_channel_overrides')
      .eq('slug', slug)
      .single()
    if (error) throw new Error(`No se pudo releer ${slug}: ${error.message}`)
    return data
  }

  test('los eventos generales permiten editar y persistir sus datos', async ({ page }) => {
    await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })
    const events = [
      [fixture.eventSlug, fixture.eventTitle],
      [fixture.manualOnlyEventSlug, fixture.manualOnlyEventTitle],
      [fixture.soldOutEventSlug, fixture.soldOutEventTitle],
      [fixture.pausedEventSlug, fixture.pausedEventTitle],
    ]

    for (const [slug, title] of events) {
      await page.goto(buildAdminEventPath(slug))
      await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
        timeout: 20_000,
      })
      await expect(page.locator('#event-title')).toHaveValue(title)

      const venue = page.locator('#event-venue')
      const original = await venue.inputValue()
      const edited = `${original} · editado E2E`
      await venue.fill(edited)
      await saveEvent(page)
      await expect.poll(async () => (await storedEvent(slug)).venue).toBe(edited)

      await venue.fill(original)
      await saveEvent(page)
      await expect.poll(async () => (await storedEvent(slug)).venue).toBe(original)
    }
  })

  test('la matriz del evento guarda Mercado Pago, transferencia, efectivo y Wise', async ({
    page,
  }) => {
    await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })
    await page.goto(buildAdminEventPath(fixture.ticketEventSlug))
    await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('tab', { name: /ventas y cupos/i }).click()
    await page.getByRole('tab', { name: /^Cobro$/i }).click()
    await expect(page.locator('#event-bank-alias')).toHaveValue('plu.e2e.qa')

    const channels = ['Mercado Pago', 'Transferencia', 'Efectivo Pitbull', 'Wise']
    for (const channel of channels) {
      await expect(page.getByRole('checkbox', { name: `${channel} · Inscripción` })).toBeChecked()
      await expect(page.getByRole('checkbox', { name: `${channel} · Entradas` })).toBeChecked()
    }

    const wiseTickets = page.getByRole('checkbox', { name: 'Wise · Entradas' })
    await wiseTickets.uncheck()
    await saveEvent(page)
    await expect
      .poll(async () => (await storedEvent(fixture.ticketEventSlug)).payment_channel_overrides)
      .toMatchObject({ ticket: { wise_transfer: false } })

    await wiseTickets.check()
    await saveEvent(page)
    await expect
      .poll(async () => (await storedEvent(fixture.ticketEventSlug)).payment_channel_overrides)
      .toMatchObject({
        registration: {
          mercado_pago: true,
          bank_transfer: true,
          cash_pitbull: true,
          wise_transfer: true,
        },
        ticket: {
          mercado_pago: true,
          bank_transfer: true,
          cash_pitbull: true,
          wise_transfer: true,
        },
      })
  })
})
