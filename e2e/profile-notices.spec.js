import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './admin-helpers.js'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import {
  deleteTestAthletes,
  desktopNoticeBell,
  fillRequiredProfileFields,
  goHomeLoggedIn,
  insertIncompleteAthlete,
  openAthleteRow,
  openPeopleAthletes,
  searchAthlete,
  watchPageErrors,
  writeAthleteAuthState,
} from './profile-notices-helpers.js'
import { acceptCookies } from './redeem-code.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ALPHA_AUTH_PATH = join(__dirname, '.auth', 'notice-alpha.json')
const BETA_AUTH_PATH = join(__dirname, '.auth', 'notice-beta.json')
const STAFF_NOTE = 'Completá teléfono y gimnasio para poder inscribirte.'

let fixture
let admin
let alpha
let beta

test.describe.configure({ mode: 'serial', timeout: 90_000 })

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  process.env.SUPABASE_URL = supabase.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = supabase.serviceRoleKey
  process.env.AUTH_SECRET = 'e2e-checkout-coupon-secret'
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const run = randomUUID().slice(0, 8)
  alpha = await insertIncompleteAthlete(admin, { run, suffix: 'Alpha' })
  beta = await insertIncompleteAthlete(admin, { run, suffix: 'Beta' })
  await writeAthleteAuthState(admin, alpha.id, ALPHA_AUTH_PATH)
  await writeAthleteAuthState(admin, beta.id, BETA_AUTH_PATH)
})

test.afterAll(async () => {
  if (!admin) return
  await deleteTestAthletes(admin, [alpha?.id, beta?.id])
})

function adminCredentials() {
  return { email: fixture.adminEmail, password: fixture.adminPassword }
}

test.describe('Avisos de perfil — invitado y staff', () => {
  test('un invitado no ve la campana en el chrome público', async ({ page }) => {
    const errors = watchPageErrors(page)
    await page.goto('/')
    await acceptCookies(page)
    await expect(page.locator('.plu-global-nav')).toBeVisible()
    await expect(desktopNoticeBell(page)).toHaveCount(0)
    await expect(page.locator('#plu-notice-menu-trigger')).toHaveCount(0)
    await errors.assertClean()
  })

  test('el staff ve la campana fija y el estado vacío', async ({ page }) => {
    const errors = watchPageErrors(page)
    await loginAsAdmin(page, adminCredentials())
    await page.getByRole('button', { name: /volver al sitio/i }).click()
    await expect(page.locator('.plu-global-nav')).toBeVisible({ timeout: 15_000 })
    const bell = desktopNoticeBell(page)
    await expect(bell).toBeVisible()
    await expect(bell).toHaveAttribute('aria-label', /^Avisos$/i)
    await expect(page.locator('.plu-global-nav__notice-dot')).toHaveCount(0)

    await bell.click()
    const menu = page.getByRole('dialog', { name: /sin avisos/i })
    await expect(menu).toBeVisible()
    await expect(menu).toContainText(/no tenés comunicados pendientes/i)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(bell).toBeVisible()
    await errors.assertClean()
  })
})

test.describe('Avisos de perfil — panel admin', () => {
  test('no ofrece enviar aviso si el perfil ya está completo', async ({ page }) => {
    const errors = watchPageErrors(page)
    await loginAsAdmin(page, adminCredentials())
    await openPeopleAthletes(page)
    await searchAthlete(page, fixture.athleteId ? `E2E Cupón ${fixture.run}` : 'E2E Cupón')
    const completeName = page.locator('.ant-table-row, .data-table-card').filter({
      hasText: /E2E Cupón/i,
    })
    await expect(completeName.first()).toBeVisible({ timeout: 15_000 })
    await completeName.first().getByText(/E2E Cupón/i).first().click()
    await expect(page.locator('.athlete-detail')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#athlete-profile-notice-title')).toHaveText(/perfil para inscribirse/i)
    await expect(page.locator('.athlete-detail__notice-status')).toContainText(
      /completo\. puede inscribirse/i,
    )
    await expect(page.getByRole('button', { name: /enviar aviso al atleta/i })).toHaveCount(0)
    await errors.assertClean()
  })

  test('envía el aviso desde la ficha del atleta incompleto', async ({ page }) => {
    const errors = watchPageErrors(page)
    await loginAsAdmin(page, adminCredentials())
    await openPeopleAthletes(page)
    await searchAthlete(page, alpha.full_name)
    await openAthleteRow(page, alpha.full_name)
    await expect(page.locator('.athlete-detail__notice-status')).toContainText(/faltan:/i)
    await page.locator('#athlete-profile-notice-note').fill(STAFF_NOTE)
    await page.getByRole('button', { name: /enviar aviso al atleta/i }).click()
    await expect(page.locator('.athlete-detail__notice-sent')).toContainText(/aviso enviado/i, {
      timeout: 15_000,
    })
    await expect(page.getByRole('alert')).toHaveCount(0)
    await errors.assertClean()
  })
})

test.describe('Avisos de perfil — atleta con aviso', () => {
  test.use({ storageState: ALPHA_AUTH_PATH })

  test('ve el unread, lee el aviso, va a completar y lo descarta', async ({ page }) => {
    const errors = watchPageErrors(page)
    await goHomeLoggedIn(page)

    const bell = desktopNoticeBell(page)
    await expect(bell).toBeVisible()
    await expect(bell).toHaveAttribute('aria-label', /tenés un aviso de la federación/i)
    await expect(page.locator('.plu-global-nav__actions .plu-global-nav__notice-dot')).toBeVisible()

    await bell.click()
    const menu = page.getByRole('dialog')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('heading', { name: /datos pendientes/i })).toBeVisible()
    await expect(menu).toContainText(/para inscribirte a un evento oficial faltan/i)
    await expect(menu).toContainText(STAFF_NOTE)

    await expect(bell).toHaveAttribute('aria-label', /^Avisos$/i, { timeout: 10_000 })
    await expect(page.locator('.plu-global-nav__actions .plu-global-nav__notice-dot')).toHaveCount(0)

    await menu.getByRole('button', { name: /completar datos/i }).click()
    await expect(page).toHaveURL(/\/(mi-cuenta|perfil)/)
    const banner = page.locator('.account-verify--profile-notice')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/datos pendientes/i)
    await expect(banner).toContainText(STAFF_NOTE)

    await banner.getByRole('button', { name: /completar datos/i }).click()
    await expect(page.getByRole('heading', { name: /datos personales/i })).toBeVisible()

    await banner.getByRole('button', { name: /entendido/i }).click()
    await expect(banner).toBeHidden()

    await bell.click()
    await expect(page.getByRole('dialog', { name: /sin avisos/i })).toBeVisible()
    await errors.assertClean()
  })
})

test.describe('Avisos de perfil — aviso en bloque', () => {
  test('el admin avisa a los incompletos seleccionados', async ({ page }) => {
    const errors = watchPageErrors(page)
    await loginAsAdmin(page, adminCredentials())
    await openPeopleAthletes(page)
    await searchAthlete(page, 'E2E Aviso')
    await expect(page.getByText(alpha.full_name, { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(beta.full_name, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /elegir entre \d+ perfiles incompletos/i }).click()
    await page.getByRole('button', { name: /seleccionar \d+ perfiles incompletos de esta página/i }).click()
    await page.getByRole('button', { name: /^Listo$/i }).click()

    const bulk = page.getByRole('region', { name: /acciones en bloque/i })
    await expect(bulk).toBeVisible()
    await bulk.getByRole('button', { name: /avisar perfil incompleto/i }).click()
    await expect(bulk.locator('#admin-athletes-bulk-notice')).toBeVisible()
    await expect(bulk.locator('.admin-athletes-bulk__preview-title')).toHaveText(/datos pendientes/i)
    await bulk.locator('#admin-athletes-bulk-notice').fill('Lote E2E: completá tus datos.')
    await bulk.getByRole('button', { name: /^Enviar aviso$/i }).click()
    await expect(bulk.locator('.admin-athletes-bulk__result')).toContainText(/avisos enviados/i, {
      timeout: 20_000,
    })
    await expect(page.getByRole('alert')).toHaveCount(0)
    await errors.assertClean()
  })
})

test.describe('Avisos de perfil — atleta del lote', () => {
  test.use({ storageState: BETA_AUTH_PATH })

  test('ve el aviso masivo, completa el perfil y la campana queda vacía', async ({ page }) => {
    const errors = watchPageErrors(page)
    await goHomeLoggedIn(page)

    const bell = desktopNoticeBell(page)
    await expect(bell).toBeVisible()
    await expect(page.locator('.plu-global-nav__actions .plu-global-nav__notice-dot')).toBeVisible()
    await bell.click()
    const menu = page.getByRole('dialog')
    await expect(menu).toContainText(/lote e2e: completá tus datos/i)
    await menu.getByRole('button', { name: /completar datos/i }).click()

    await expect(page.locator('.account-verify--profile-notice')).toBeVisible()
    await page.locator('.account-verify--profile-notice').getByRole('button', { name: /completar datos/i }).click()
    await fillRequiredProfileFields(page)
    await expect(page.locator('.account-verify--profile-notice')).toHaveCount(0)

    await goHomeLoggedIn(page)
    await expect(desktopNoticeBell(page)).toBeVisible()
    await desktopNoticeBell(page).click()
    await expect(page.getByRole('dialog', { name: /sin avisos/i })).toBeVisible()
    await errors.assertClean()
  })
})
