import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { loginAsAdmin } from './admin-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

test.describe('Admin — operación de cobros', () => {
  test('carga Cobros, alterna sus vistas y no expone errores internos', async ({ page }) => {
    await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })

    const operationsResponse = page.waitForResponse(
      (response) => response.url().includes('/api/payments/operations') && response.request().method() === 'GET',
    )
    await page
      .locator('.admin-shell .ant-menu-item')
      .filter({ has: page.getByText('Cobros', { exact: true }) })
      .click()
    expect((await operationsResponse).ok(), 'GET /api/payments/operations').toBeTruthy()

    const section = page.locator('.admin-payments-operations')
    await expect(section).toBeVisible({ timeout: 20_000 })
    await expect(section.getByRole('heading', { name: /cobros|operación/i })).toBeVisible()
    await expect(section.getByText(/Error interno/i)).toHaveCount(0)

    const ledgerTab = section.getByRole('tab', { name: /diagnóstico/i })
    await ledgerTab.click()
    await expect(page.locator('#admin-payment-ledger')).toBeVisible({ timeout: 10_000 })
    await expect(section.getByText(/Error interno/i)).toHaveCount(0)
  })
})
