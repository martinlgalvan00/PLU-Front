import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { buildAdminEventPath } from '../src/lib/adminEventRoute.js'
import { loginAsAdmin } from './admin-helpers.js'
import { FIXTURE_PATH } from './global-setup.js'

test('el menú del panel sale del workspace sin pasar por Volver', async ({ page }) => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  await loginAsAdmin(page, {
    email: fixture.adminEmail,
    password: fixture.adminPassword,
  })
  await page.goto(buildAdminEventPath(fixture.eventSlug))
  await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
    timeout: 20_000,
  })

  await page
    .locator('.admin-shell .ant-menu-item')
    .filter({ has: page.getByText('Personas', { exact: true }) })
    .click()

  await expect(page.getByRole('heading', { name: /^Atletas$/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('region', { name: /evento seleccionado/i })).toHaveCount(0)

  await page
    .locator('.admin-shell .ant-menu-item')
    .filter({ has: page.getByText('Eventos', { exact: true }) })
    .click()
  await expect(page.getByRole('heading', { name: /^Eventos$/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('region', { name: /evento seleccionado/i })).toHaveCount(0)
})
