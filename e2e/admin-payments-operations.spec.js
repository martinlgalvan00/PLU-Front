import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { loginAsAdmin } from './admin-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

function adminNavItem(page, label) {
  return page
    .locator('.admin-shell .ant-menu-item')
    .filter({ has: page.getByText(label, { exact: true }) })
}

test.describe('Admin — operación de cobros', () => {
  test('carga Cobros, alterna sus vistas y no expone errores internos', async ({ page }) => {
    await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })

    // Cobros es la cola manual (Atletas / Entradas): ya no pide
    // `/api/payments/operations`, que se mudó con el diagnóstico a Auditoría.
    const ordersResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/athletes/admin/payment-orders?') &&
        response.request().method() === 'GET',
    )
    await adminNavItem(page, 'Cobros').click()
    expect((await ordersResponse).ok(), 'GET /api/athletes/admin/payment-orders').toBeTruthy()

    const section = page.locator('.admin-payments-operations')
    await expect(section).toBeVisible({ timeout: 20_000 })
    await expect(section.getByRole('heading', { level: 1, name: /^Cobros$/i })).toBeVisible()
    await expect(section.getByText(/Error interno/i)).toHaveCount(0)

    const queueTabs = section.getByRole('tablist', { name: /^Cobros$/i })
    await queueTabs.getByRole('tab', { name: /entradas/i }).click()
    // `#admin-ticket-orders` está dos veces (ancla de la pestaña + la sección
    // de la cola): se apunta a la sección para no chocar con el strict mode.
    await expect(section.locator('section#admin-ticket-orders')).toBeVisible({ timeout: 10_000 })
    await queueTabs.getByRole('tab', { name: /atletas/i }).click()
    await expect(section.locator('#admin-athlete-payments')).toBeVisible({ timeout: 10_000 })
    await expect(section.getByText(/Error interno/i)).toHaveCount(0)

    // El diagnóstico contra Mercado Pago (ex pestaña "Diagnóstico" de Cobros)
    // vive en Auditoría, que lee `/api/payments/operations` apenas monta.
    const operationsResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/payments/operations') &&
        !response.url().includes('/api/payments/operations/') &&
        response.request().method() === 'GET',
    )
    await adminNavItem(page, 'Auditoría').click()
    expect((await operationsResponse).ok(), 'GET /api/payments/operations').toBeTruthy()

    const audit = page.locator('.audit-page')
    await expect(audit).toBeVisible({ timeout: 20_000 })
    await audit.getByRole('tab', { name: /^Diagnóstico$/i }).click()
    await expect(audit.getByRole('region', { name: /^Diagnóstico$/i })).toBeVisible({
      timeout: 10_000,
    })
    await expect(audit.getByText(/Error interno/i)).toHaveCount(0)
  })
})
