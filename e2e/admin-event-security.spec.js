import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin, openAdminEventSecurity } from './admin-helpers.js'
import { deleteEventsByIds } from './fixture-cleanup.js'
import { FIXTURE_PATH } from './global-setup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'
import { acceptCookies } from './ticket-purchase-helpers.js'

let fixture
let event

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  const admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const run = randomUUID().slice(0, 8)
  const slug = `e2e-security-ui-${run}`
  const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const endsAt = new Date(Date.now() + 31 * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug,
      title: `E2E Seguridad UI ${run}`,
      venue: 'QA Gym',
      location: 'CABA',
      price: 75000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('id, slug, title')
    .single()
  if (error) throw new Error(`No se pudo crear el evento de seguridad UI: ${error.message}`)
  event = data
})

test.afterAll(async () => {
  if (!event?.id) return
  const supabase = resolveLocalSupabase()
  const admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await deleteEventsByIds(admin, [event.id])
})

async function loginAdmin(page) {
  await loginAsAdmin(page, {
    email: fixture.adminEmail,
    password: fixture.adminPassword,
  })
}

async function ensureStandardZones(page) {
  const empty = page.locator('.admin-event-zones__empty')
  if (await empty.isVisible()) {
    await page.getByRole('button', { name: /armar zonas de un meet estándar/i }).click()
  }
  await expect(page.locator('.admin-event-zones')).toContainText('Puerta principal', {
    timeout: 15_000,
  })
  await expect(page.locator('.admin-event-zones')).toContainText('Pesaje')
  await expect(page.locator('.admin-event-zones')).toContainText('Calentamiento')
  await expect(page.locator('.admin-event-zones')).toContainText('Plataforma')
}

async function fillTeamMember(page, { name, email }, index = 0) {
  await page.locator('input[name^="security-name-"]').nth(index).fill(name)
  await page.locator('input[name^="security-email-"]').nth(index).fill(email)
}

async function createDoorPerson(page, person) {
  const sendEmail = page.getByRole('checkbox', { name: /enviar el acceso personal/i })
  if (await sendEmail.isChecked()) await sendEmail.uncheck()
  await fillTeamMember(page, person)
  await page.getByRole('button', { name: /^crear acceso$/i }).click()
  const delivery = page.locator('.security-team-delivery')
  await expect(delivery).toBeVisible({ timeout: 20_000 })
  await expect(delivery).toContainText(person.email)
  await expect(delivery.locator('code')).toBeVisible()
  const accessUrl = (await delivery.locator('code').innerText()).trim()
  return accessUrl
}

async function finishDelivery(page) {
  await page.locator('.security-team-delivery').getByRole('button', { name: /^listo$/i }).click()
  await expect(page.locator('.security-team-delivery')).toHaveCount(0)
}

async function openGateInFreshContext(browser, url) {
  const context = await browser.newContext()
  const gatePage = await context.newPage()
  await gatePage.goto(url)
  await acceptCookies(gatePage)
  return { context, gatePage }
}

test.describe('Admin — zonas y equipo de puerta', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })

  test('el aviso es honesto y el empty permite armar el meet estándar', async ({ page }) => {
    await loginAdmin(page)
    await openAdminEventSecurity(page, event.slug)

    const notice = page.locator('.admin-event-workspace__notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(/filtra qué se lee/i)
    await expect(notice).not.toContainText(/todavía no filtra/i)
    await expect(notice).not.toContainText(/abrir control de puerta/i)
    await expect(page.locator('.admin-event-zones')).toContainText(/paso 1 · zonas/i)
    await expect(page.locator('.admin-event-zones')).toContainText(/cada zona define/i)
    await expect(page.locator('.security-team-builder')).toContainText(/paso 2 · equipo/i)
    await expect(page.getByRole('button', { name: /^crear acceso$/i })).toBeVisible()
    await expect(page.locator('fieldset.admin-event-form__pricing.admin-event-security')).toHaveCount(
      0,
    )

    const empty = page.locator('.admin-event-zones__empty')
    if (await empty.isVisible()) {
      await expect(page.locator('.admin-event-zones__summary')).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: /armar zonas de un meet estándar/i }),
      ).toBeVisible()
    }

    await ensureStandardZones(page)
    await expect(page.locator('.admin-event-zones__summary')).toBeVisible()
  })

  test('el alta a mano de una zona y de una cuenta queda asignada', async ({ page }) => {
    const stamp = randomUUID().slice(0, 8)
    const zoneName = `Sala de espera ${stamp}`
    const person = {
      name: `E2E Zona ${stamp}`,
      email: `e2e-zone-${stamp}@pluarg.test`,
    }

    await loginAdmin(page)
    await openAdminEventSecurity(page, event.slug)
    await ensureStandardZones(page)

    await page.getByRole('button', { name: /^agregar zona$/i }).click()
    await expect(page.locator('input[name="zone-name"]')).toBeVisible()
    await page.locator('input[name="zone-name"]').fill(zoneName)
    await page.getByRole('button', { name: /^crear zona$/i }).click()
    await expect(page.locator('.admin-event-zones__form')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.admin-event-zones__list')).toContainText(zoneName, {
      timeout: 15_000,
    })

    const accessUrl = await createDoorPerson(page, person)
    expect(accessUrl).toMatch(/acceso=/)
    await expect(page.locator('.security-team-delivery')).toContainText(/paso 3 · entrega/i)
    await finishDelivery(page)

    await expect(page.locator('.admin-event-security__list')).toContainText(person.email, {
      timeout: 15_000,
    })
    await expect(page.locator('.admin-event-zones__unassigned')).toContainText(person.email, {
      timeout: 15_000,
    })

    await page
      .getByLabel(new RegExp(`asignar zona a ${person.name}`, 'i'))
      .selectOption({ label: zoneName })
    await expect(page.locator('.admin-event-zones__loading')).toHaveCount(0)
    await expect(
      page.locator('.admin-event-security__item', { hasText: person.email }),
    ).toContainText(zoneName, { timeout: 15_000 })
  })

  test('alta, asignación, link de acceso y baja se ven en la puerta', async ({ page, browser }) => {
    const stamp = randomUUID().slice(0, 8)
    const person = {
      name: `E2E Portero ${stamp}`,
      email: `e2e-security-ui-${stamp}@pluarg.test`,
    }

    await loginAdmin(page)
    await openAdminEventSecurity(page, event.slug)
    await ensureStandardZones(page)
    const accessUrl = await createDoorPerson(page, person)
    expect(accessUrl).toMatch(/acceso=/)
    await finishDelivery(page)

    await expect(page.locator('.admin-event-security__list')).toContainText(person.email, {
      timeout: 15_000,
    })
    await expect(page.locator('.admin-event-zones__unassigned')).toContainText(person.email, {
      timeout: 15_000,
    })

    await page
      .getByLabel(new RegExp(`asignar zona a ${person.name}`, 'i'))
      .selectOption({ label: 'Puerta principal' })
    await expect(page.locator('.admin-event-zones__loading')).toHaveCount(0)
    await expect(page.locator('.admin-event-zones__list')).toBeVisible()
    await expect(page.locator('.admin-event-zones__unassigned')).toHaveCount(0, { timeout: 15_000 })
    await expect(
      page.locator('.admin-event-security__item', { hasText: person.email }),
    ).toContainText('Puerta principal')

    const { context, gatePage } = await openGateInFreshContext(browser, accessUrl)
    await expect(gatePage.locator('.checkin-app')).toBeVisible({ timeout: 20_000 })
    await expect(gatePage.locator('.checkin-app__zone-notice')).toContainText('Puerta principal')
    await context.close()

    const row = page.locator('.admin-event-security__item', { hasText: person.email })
    await row.getByRole('button', { name: /dar de baja/i }).click()
    await expect(row).toContainText(/desactivado/i)

    const closed = await openGateInFreshContext(browser, accessUrl)
    await expect(closed.gatePage.getByRole('alert')).toContainText(/no es válida o venció/i)
    await expect(closed.gatePage.locator('.checkin-app')).toHaveCount(0)
    await closed.context.close()
  })

  test('el alta masiva omite una cuenta de otro evento', async ({ page }) => {
    const stamp = randomUUID().slice(0, 8)
    const extra = {
      name: `E2E Nueva ${stamp}`,
      email: `e2e-security-ui-new-${stamp}@pluarg.test`,
    }

    await loginAdmin(page)
    await openAdminEventSecurity(page, event.slug)

    await page.getByRole('button', { name: /agregar otra persona/i }).click()
    await fillTeamMember(page, { name: 'E2E Puerta', email: fixture.gateEmail }, 0)
    await fillTeamMember(page, extra, 1)
    const sendEmail = page.getByRole('checkbox', { name: /enviar el acceso personal/i })
    if (await sendEmail.isChecked()) await sendEmail.uncheck()
    await page.getByRole('button', { name: /crear 2 accesos/i }).click()

    const delivery = page.locator('.security-team-delivery')
    await expect(delivery).toBeVisible({ timeout: 20_000 })
    await expect(delivery).toContainText(extra.email)
    await expect(delivery).toContainText(fixture.gateEmail)
    await expect(delivery).toContainText(/ya está asignada a otro evento/i)
    await expect(delivery).toContainText(/1 cuenta no se creó/i)
  })
})
