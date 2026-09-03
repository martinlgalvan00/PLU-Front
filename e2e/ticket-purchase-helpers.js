import { expect } from '@playwright/test'

/**
 * ticket-purchase-helpers.js — PLU ARG
 *
 * Helpers compartidos para los tests E2E de compra de entradas. Siguen la
 * misma convención que redeem-code.js: cada helper espera un punto de
 * sincronía antes de retornar, para que el test no arranque el paso
 * siguiente antes de que la UI termine de pintar.
 */

/** Consentimiento de cookies, como lo resolvería cualquier visita real. */
export async function acceptCookies(page) {
  const cookieAcceptAll = page.getByRole('button', { name: /^Aceptar todo$/i })
  await cookieAcceptAll
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => cookieAcceptAll.click())
    .catch(() => {})
}

/**
 * Navega a la página de entradas para un evento concreto. El slug se pasa
 * como fragmento de la URL: `/entradas/<slug>`.
 */
export async function navigateToTickets(page, eventSlug) {
  await page.goto(`/entradas/${eventSlug}`)
  // Espera a que el hero de la página de entradas esté listo.
  await page.waitForSelector('.tickets-page__hero', { timeout: 15_000 })
}

/**
 * Navega a la página del evento (Pitbull) y desde ahí accede a las entradas.
 * Útil para verificar la navegación desde la landing del evento.
 */
export async function navigateFromEventToTickets(page, eventSlug) {
  await page.goto(`/evento/${eventSlug}`)
  const ticketCta = page.getByRole('link', { name: /entr(ada|é)/i })
  await ticketCta.waitFor({ state: 'visible', timeout: 10_000 })
  await ticketCta.click()
  await page.waitForSelector('.tickets-page__hero', { timeout: 15_000 })
}

/**
 * Verifica que un tipo de entrada sea visible en la sección de ofertas.
 * @param {import('@playwright/test').Page} page
 * @param {string} name — nombre del tipo (ej. "Entrenadores", "Público general")
 * @param {string} priceText — fragmento del precio formateado (ej. "10.000", "20.000")
 */
export async function assertTicketTypeVisible(page, name, priceText) {
  const offersGrid = page.locator('.tickets-page__offers-grid')
  const offer = offersGrid.locator('article', { hasText: name })
  await expect(offer).toBeVisible({ timeout: 5_000 })
  await expect(offer).toContainText(priceText)
}

/**
 * Llena el formulario de un asistente por su índice (0-indexed). Funciona
 * tanto con el formulario individual como con la tabla batch.
 */
export async function fillAttendeeForm(page, index, { fullName, dni }) {
  const nameInput = page.locator(`input[name="attendee-${index}-fullName"]`)
  const dniInput = page.locator(`input[name="attendee-${index}-dni"]`)

  await nameInput.waitFor({ state: 'visible', timeout: 5_000 })
  await nameInput.fill(fullName)
  await dniInput.fill(dni)
}

/**
 * Selecciona un tipo de entrada para un asistente. En el formulario, los
 * tipos son botones con aria-pressed dentro de un group.
 */
export async function selectTicketType(page, index, typeName) {
  const row = page.locator('.ticket-purchase__attendee-row, .ticket-purchase__attendees-batch-row').nth(index)
  const typeButton = row.getByRole('button', { name: typeName })
  await typeButton.click()
  await expect(typeButton).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Ajusta la cantidad de entradas (+ / -). Los botones de cantidad usan
 * Plus y Minus icons.
 */
export async function setTicketQuantity(page, quantity) {
  const qtySection = page.locator('.ticket-purchase__qty')
  const currentValue = await qtySection.locator('input, .ticket-purchase__qty-value').textContent()
    .catch(() => '1')
  const current = parseInt(currentValue, 10) || 1

  if (quantity > current) {
    const addButton = qtySection.getByRole('button', { name: /agregar|más|add|\+/i })
    for (let i = current; i < quantity; i++) {
      await addButton.click()
    }
  } else if (quantity < current) {
    const removeButton = qtySection.getByRole('button', { name: /quitar|menos|remove|−/i })
    for (let i = current; i > quantity; i--) {
      await removeButton.click()
    }
  }
}

/**
 * Selecciona el método de pago. Los radio buttons usan name="ticket-payment".
 */
export async function selectPaymentMethod(page, method) {
  const radio = page.locator(`input[name="ticket-payment"][value="${method}"]`)
  await radio.waitFor({ state: 'visible', timeout: 5_000 })
  await radio.check({ force: true })
  await expect(radio).toBeChecked()
}

/**
 * Envía el formulario de compra de entradas.
 */
export async function submitTicketPurchase(page) {
  const submitButton = page.getByRole('button', { name: /comprar|confirmar|continuar/i })
  await submitButton.click()
}

/**
 * Verifica que la orden se haya creado exitosamente. La pantalla de
 * confirmación muestra un bloque con la info de la orden.
 */
export async function assertOrderCreated(page, { expectedAmount, expectedQuantity }) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })

  if (expectedAmount) {
    await expect(confirmation).toContainText(expectedAmount)
  }
  if (expectedQuantity) {
    const quantityText = expectedQuantity === 1
      ? /1\s*(entrada|ticket)/i
      : new RegExp(`${expectedQuantity}\\s*(entradas|tickets)`, 'i')
    await expect(confirmation).toContainText(quantityText)
  }
}

/**
 * Verifica que la venta de entradas esté pausada (indicador de "próximamente").
 */
export async function assertSalesPaused(page) {
  const pausedText = page.locator('.tickets-page__sales-paused')
  await expect(pausedText).toBeVisible({ timeout: 5_000 })
}

/**
 * Verifica que el checkout de entradas esté visible y activo.
 */
export async function assertCheckoutVisible(page) {
  const checkoutSection = page.locator('#checkout')
  await expect(checkoutSection).toBeVisible()
  const form = checkoutSection.locator('.ticket-purchase')
  await expect(form).toBeVisible({ timeout: 10_000 })
}

/**
 * Verifica la información del evento en el hero de la página de entradas.
 */
export async function assertEventInfo(page, { title, date, venue }) {
  const hero = page.locator('.tickets-page__hero')
  if (title) await expect(hero).toContainText(title)
  if (date) await expect(hero).toContainText(date)
  if (venue) await expect(hero).toContainText(venue)
}
