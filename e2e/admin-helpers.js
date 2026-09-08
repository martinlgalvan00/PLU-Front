import { expect } from '@playwright/test'
import { buildAdminEventPath } from '../src/lib/adminEventRoute.js'
import { acceptCookies } from './ticket-purchase-helpers.js'

/**
 * Login de staff al panel. Apaga el tour y deja el sidebar expandido para
 * que los specs no dependan de un viewport concreto.
 */
export async function loginAsAdmin(page, { email, password }) {
  await page.addInitScript(() => {
    localStorage.setItem('plu-tour-mode', 'off')
    localStorage.setItem('plu-admin-sidebar-mode', 'expanded')
  })
  await page.goto('/acceder')
  await acceptCookies(page)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /^Ingresar$/i }).click()
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 20_000 })
}

export async function openAdminEventSecurity(page, eventSlug) {
  await page.goto(buildAdminEventPath(eventSlug))
  await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('tab', { name: /zonas y seguridad/i }).click()
  await expect(page.locator('.admin-event-zones')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.admin-event-security')).toBeVisible()
  await expect(page.locator('.admin-event-zones__empty, .admin-event-zones__list')).toBeVisible()
}
