import { expect } from '@playwright/test'
import { buildSecurityGatePath } from '../src/lib/securityGateRoute.js'
import { acceptCookies } from './ticket-purchase-helpers.js'

export function ticketCredentialScanValue(qrToken, eventSlug) {
  return `/?credencial=${qrToken}&tipo=ticket&evento=${eventSlug}`
}

export async function openSecurityGate(page, eventSlug) {
  await page.goto(buildSecurityGatePath(eventSlug))
  await acceptCookies(page)
}

export async function loginSecurityGate(page, { email, password, eventTitle }) {
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /entrar a seguridad/i }).click()
  await expect(page.locator('.checkin-app')).toBeVisible({ timeout: 15_000 })
  await switchToManualScan(page)
  if (eventTitle) {
    await expect(page.locator('.checkin-app')).toContainText(eventTitle)
  }
}

export async function assertGateZone(page, zoneName) {
  const notice = page.locator('.checkin-app__zone-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(zoneName)
}

export async function switchToManualScan(page) {
  const manualTab = page.getByRole('tab', { name: /manual|código/i })
  await manualTab.click()
  await expect(page.locator('#admin-checkin-manual')).toBeVisible()
}

export async function dismissScanResult(page) {
  const result = page.locator('.admin-checkin-result')
  if ((await result.count()) === 0) return
  await result.getByRole('button', { name: /cerrar/i }).click()
  await expect(result).toHaveCount(0)
}

export async function scanCredential(page, codeOrUrl) {
  await switchToManualScan(page)
  await dismissScanResult(page)
  const input = page.locator('#admin-checkin-manual')
  await expect(input).toBeEnabled()
  await input.fill(codeOrUrl)
  await page.getByRole('button', { name: /^verificar$/i }).click()
  await expect(page.locator('.admin-checkin-result')).toBeVisible({ timeout: 15_000 })
}

export async function assertScanResult(page, { outcome, name, label, status }) {
  const result = page.locator('.admin-checkin-result')
  await expect(result).toBeVisible()
  if (outcome) await expect(result).toContainText(outcome)
  if (name) await expect(result).toContainText(name)
  if (label) {
    await expect(result.locator('.admin-checkin-result__credential')).toContainText(label)
  }
  if (status) await expect(result).toContainText(status)
}

export async function markGateEntry(page) {
  await page.getByRole('button', { name: /registrar ingreso/i }).click()
  await expect(page.locator('.admin-checkin-result')).toContainText(/ingreso registrado/i, {
    timeout: 10_000,
  })
}

export async function openScanTab(page) {
  await page.locator('.checkin-app__tab', { hasText: /Escanear/i }).click()
  await expect(page.locator('.admin-checkin-scanner')).toBeVisible()
}

export async function openTicketsAllowlist(page) {
  await page.locator('.checkin-app__tab', { hasText: /Entradas/i }).click()
  await expect(page.locator('.checkin-app__list')).toBeVisible()
}

export async function assertAllowlistPerson(page, { name, label }) {
  await openTicketsAllowlist(page)
  await page.locator('.checkin-app__search input[type="search"]').fill(name)
  const list = page.locator('.checkin-app__list')
  await expect(list).toContainText(name)
  if (label) await expect(list).toContainText(label)
}
