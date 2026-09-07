import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { acceptCookies } from './ticket-purchase-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

async function loginAsAdmin(page) {
  await page.addInitScript(() => {
    localStorage.setItem('plu-tour-mode', 'off')
    localStorage.setItem('plu-admin-sidebar-mode', 'expanded')
  })
  await page.goto('/acceder')
  await acceptCookies(page)
  await page.locator('input[name="email"]').fill(fixture.adminEmail)
  await page.locator('input[name="password"]').fill(fixture.adminPassword)
  await page.getByRole('button', { name: /^Ingresar$/i }).click()
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 20_000 })
}

function adminNavItem(page, label) {
  return page
    .locator('.admin-shell .ant-menu-item')
    .filter({ has: page.getByText(label, { exact: true }) })
}

const EXPIRY_UNIT_TAB = {
  minutes: /minutos/i,
  hours: /horas/i,
  days: /días/i,
}

async function saveExpiryWindow(page, input, { unit, amount, vigente }) {
  const windowCard = page.locator('.admin-payment-expiry__window', { has: input })
  const unitSwitch = page.locator(`#${await input.getAttribute('id')}-unit`)
  await unitSwitch.getByRole('tab', { name: EXPIRY_UNIT_TAB[unit] }).click()
  await input.fill(String(amount))
  const save = windowCard.getByRole('button', { name: /^Guardar$/i })
  await save.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {})
  if (await save.isVisible()) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/platform-settings/windows') &&
        response.request().method() === 'PUT',
    )
    await save.click()
    expect((await responsePromise).ok(), 'PUT /api/platform-settings/windows').toBeTruthy()
  }
  await expect(windowCard).toContainText(vigente)
}

test.describe('Admin — plazos, abandono y analítica', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })

  test('se puede configurar el vencimiento en días y la gracia de abandono en horas', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await adminNavItem(page, 'Cobros').click()
    const panel = page.locator('.admin-payment-expiry')
    await expect(panel).toBeVisible({ timeout: 20_000 })
    await expect(panel).toContainText(/Vencimiento de órdenes/)
    await expect(panel.getByText(/Error interno/)).toHaveCount(0)

    const manualInput = page.locator('#payment-expiry-window-manual')
    await expect(manualInput).toBeEnabled()
    await saveExpiryWindow(page, manualInput, {
      unit: 'days',
      amount: 3,
      vigente: /Vigente: 3 día/,
    })

    const staleInput = page.locator('#payment-expiry-window-stale_attempt')
    await saveExpiryWindow(page, staleInput, {
      unit: 'hours',
      amount: 2,
      vigente: /Vigente: 2 hora/,
    })

    await saveExpiryWindow(page, manualInput, {
      unit: 'days',
      amount: 5,
      vigente: /Vigente: 5 día/,
    })
    await saveExpiryWindow(page, staleInput, {
      unit: 'minutes',
      amount: 30,
      vigente: /Vigente: 30 minuto/,
    })
  })

  test('analítica abre sin error interno y muestra el informe', async ({ page }) => {
    await loginAsAdmin(page)
    await adminNavItem(page, 'Analítica').click()
    await expect(page.getByRole('heading', { name: /Analítica/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(/Error interno/)).toHaveCount(0)
    await expect(page.locator('.state-card--error')).toHaveCount(0)
  })
})
