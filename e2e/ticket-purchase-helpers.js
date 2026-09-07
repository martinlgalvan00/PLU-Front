import { expect } from '@playwright/test'
import { TICKETS_PATH } from '../src/lib/ticketsRoute.js'

/**
 * ticket-purchase-helpers.js — PLU ARG
 *
 * Helpers compartidos para los tests E2E de compra de entradas. Siguen la
 * misma convención que redeem-code.js: cada helper espera un punto de
 * sincronía antes de retornar, para que el test no arranque el paso
 * siguiente antes de que la UI termine de pintar.
 */

const TICKET_CODE = /TCK-\d{8}/
const QR_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CURRENT_ORDER_KEY = 'plu:current-order'

function isTicketOrderPost(response) {
  return response.request().method() === 'POST' && response.url().includes('/api/tickets/orders')
}

/** Consentimiento de cookies, como lo resolvería cualquier visita real. */
export async function acceptCookies(page) {
  const cookieAcceptAll = page.getByRole('button', { name: /^Aceptar todo$/i })
  await cookieAcceptAll
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => cookieAcceptAll.click())
    .catch(() => {})
}

async function waitForTicketsHero(page, timeout) {
  await expect(page.locator('.tickets-page__hero')).toBeVisible({ timeout })
}

/**
 * Navega a la página de entradas para un evento concreto.
 *
 * La ruta se arma con el contrato real (`ticketsRoute.js`) en vez de escribirla
 * a mano: el helper apuntaba a `/entradas/<slug>`, que no existe, así que la
 * página respondía 404 y estos tests no llegaban a ejercitar nada. El evento
 * viaja como query param, no como segmento.
 *
 * Si Vite tarda el chunk lazy de TicketsPage, el shell se queda en
 * "Cargando…" y el hero nunca aparece. Un reload alcanza: no es un fallo
 * de producto, es el arnés pidiendo el mismo módulo después de muchos tests.
 */
export async function navigateToTickets(page, eventSlug, { title, expectCheckout = true } = {}) {
  const availabilityPath = `/api/tickets/availability/${encodeURIComponent(eventSlug)}`

  const openTicketsPage = async () => {
    const catalogReady = page
      .waitForResponse(
        (response) => response.ok() && response.url().includes('/api/events/catalog'),
        { timeout: 20_000 },
      )
      .catch(() => null)
    const availabilityReady = page
      .waitForResponse((response) => response.ok() && response.url().includes(availabilityPath), {
        timeout: 20_000,
      })
      .catch(() => null)

    await page.goto(`${TICKETS_PATH}?evento=${encodeURIComponent(eventSlug)}`)
    await acceptCookies(page)
    return { catalogReady, availabilityReady }
  }

  let pending = await openTicketsPage()
  try {
    await waitForTicketsHero(page, 8_000)
  } catch {
    pending = await openTicketsPage()
    await waitForTicketsHero(page, 20_000)
  }
  await Promise.all([pending.catalogReady, pending.availabilityReady])

  if (title) {
    await expect(page.locator('#tickets-page-title')).toContainText(title, { timeout: 15_000 })
    const selected = page.locator('.tickets-page__event-option--active strong')
    if ((await selected.count()) > 0) {
      await expect(selected).toContainText(title)
    }
  }
  if (expectCheckout) {
    await assertCheckoutVisible(page)
    // Transferencia sólo aparece cuando ya llegó el interruptor de canal
    // manual: si el form se pinta antes, el default es Mercado Pago y un
    // remount posterior borra lo que se acaba de tipear.
    await expect(
      page.locator('#checkout input[name="ticket-payment"][value="transferencia"]'),
    ).toBeVisible({ timeout: 15_000 })
    await page
      .locator('#checkout input[name="attendee-0-fullName"]')
      .waitFor({ state: 'visible', timeout: 10_000 })
  }
}

/** La confirmación vive en sessionStorage: sin esto, recargar sigue en el QR. */
export async function clearCurrentTicketOrder(page) {
  await page.evaluate((key) => sessionStorage.removeItem(key), CURRENT_ORDER_KEY)
}

/**
 * Navega a la ficha pública del evento (`/evento/:slug` = calendario) y entra
 * al checkout con el CTA "Comprar entradas". No es la landing Pitbull.
 */
export async function navigateFromEventToTickets(page, eventSlug, { title } = {}) {
  await page.goto(`/evento/${encodeURIComponent(eventSlug)}`)
  await acceptCookies(page)
  if (title) {
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({
      timeout: 20_000,
    })
  }
  const ticketCta = page.getByRole('button', { name: /comprar entradas/i })
  await expect(ticketCta).toBeEnabled({ timeout: 15_000 })
  await ticketCta.click()
  await waitForTicketsHero(page, 20_000)
  if (title) {
    await expect(page.locator('#tickets-page-title')).toContainText(title, { timeout: 15_000 })
  }
  await assertCheckoutVisible(page)
}

/**
 * Verifica que un tipo de entrada sea visible en la sección de ofertas.
 * La vidriera usa `TicketTypeOptions` en lista (`li`), no articles.
 */
export async function assertTicketTypeVisible(page, name, priceText, extras = {}) {
  const offersGrid = page.locator('.tickets-page__offers-grid')
  const offer = offersGrid.locator('.ticket-type-options__option', { hasText: name })
  await expect(offer).toBeVisible({ timeout: 5_000 })
  await expect(offer).toContainText(priceText)
  if (extras.credentials) await expect(offer).toContainText(extras.credentials)
  if (extras.quotaNote) await expect(offer).toContainText(extras.quotaNote)
  if (extras.includes) await expect(offer).toContainText(extras.includes)
}

export function liveTotal(page) {
  return page.locator('.ticket-purchase__summary-inline strong')
}

export async function assertLiveTotal(page, amountText) {
  await expect(liveTotal(page)).toContainText(amountText)
}

export async function selectEventOption(page, eventTitle) {
  const option = page.locator('.tickets-page__event-option', { hasText: eventTitle })
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.locator('#tickets-page-title')).toContainText(eventTitle)
  await expect(option).toHaveClass(/tickets-page__event-option--active/)
}

export async function toggleTicketAddon(page, label, { index = 0, selected = true } = {}) {
  const addon = page.locator('.ticket-purchase__addon').filter({ hasText: label }).nth(index)
  await expect(addon).toBeVisible()
  const isSelected = await addon.evaluate((node) => node.classList.contains('is-selected'))
  if (isSelected !== selected) await addon.click()
  if (selected) await expect(addon).toHaveClass(/is-selected/)
  else await expect(addon).not.toHaveClass(/is-selected/)
}

export async function assertAddonIncluded(page, label) {
  const addon = page.locator('.ticket-purchase__addon').filter({ hasText: label })
  await expect(addon).toBeVisible()
  await expect(addon).toHaveClass(/is-included/)
  await expect(addon.locator('input[type="checkbox"]')).toBeDisabled()
  await expect(addon).toContainText(/incluido/i)
}

export async function assertPaymentMethodsVisible(page) {
  await expect(page.locator('input[name="ticket-payment"][value="mercado_pago"]')).toBeVisible()
  await expect(page.locator('input[name="ticket-payment"][value="transferencia"]')).toBeVisible()
}

async function typeAttendee(page, index, { fullName, dni }) {
  const digits = String(dni).replace(/\D/g, '')
  const form = page.locator('#checkout form.ticket-purchase')
  const nameInput = form.locator(`input[name="attendee-${index}-fullName"]`)
  const dniInput = form.locator(`input[name="attendee-${index}-dni"]`)
  await nameInput.waitFor({ state: 'visible', timeout: 5_000 })
  await nameInput.fill(fullName)
  await dniInput.fill(String(dni))
  expect(await nameInput.inputValue()).toBe(fullName)
  expect(await dniInput.inputValue()).toBe(digits)
}

/**
 * Llena el formulario de un asistente por su índice (0-indexed). Funciona
 * tanto con el formulario individual como con la tabla batch.
 */
export async function fillAttendeeForm(page, index, attendee) {
  await expect(async () => {
    await typeAttendee(page, index, attendee)
  }).toPass({ timeout: 15_000 })
}

/**
 * Deja el checkout listo para enviar. Reintenta si el catálogo o la
 * disponibilidad remontan el form y se llevan nombre, DNI o el medio de pago.
 */
export async function fillReadyTicketCheckout(
  page,
  { attendees, paymentMethod = 'transferencia', quantity } = {},
) {
  await expect(async () => {
    await applyTicketCheckout(page, { attendees, paymentMethod, quantity })
  }).toPass({ timeout: 20_000 })
}

async function applyTicketCheckout(page, { attendees, paymentMethod = 'transferencia', quantity }) {
  const targetQuantity = quantity ?? attendees.length
  if (targetQuantity > 1) await setTicketQuantity(page, targetQuantity)

  for (const [index, attendee] of attendees.entries()) {
    await typeAttendee(page, index, attendee)
    if (attendee.type) await selectTicketType(page, index, attendee.type)
    if (attendee.addon) await toggleTicketAddon(page, attendee.addon, { index, selected: true })
  }

  await selectPaymentMethod(page, paymentMethod)
  expect(await page.locator('#checkout input[name="attendee-0-fullName"]').inputValue()).toBe(
    attendees[0].fullName,
  )
  expect(
    await page.locator(`input[name="ticket-payment"][value="${paymentMethod}"]`).isChecked(),
  ).toBe(true)
}

/**
 * Compra por el formulario real. Si React remonta el checkout entre el fill
 * y el click, no hubo POST: se vuelve a llenar en vez de afirmar a ciegas
 * la pantalla de confirmación.
 */
export async function purchaseTickets(
  page,
  { attendees, paymentMethod = 'transferencia', quantity, expectOk = true } = {},
) {
  await expect(async () => {
    if (expectOk && (await page.locator('.ticket-purchase--confirmation').isVisible())) return

    await applyTicketCheckout(page, { attendees, paymentMethod, quantity })
    const submit = page.locator('#checkout form.ticket-purchase .ticket-purchase__submit')
    const responsePromise = page.waitForResponse(isTicketOrderPost, { timeout: 8_000 })
    await submit.click()

    if (expectOk) {
      const confirmation = page.locator('.ticket-purchase--confirmation')
      const nameInput = page.locator('#checkout input[name="attendee-0-fullName"]')
      if (
        !(await confirmation.isVisible()) &&
        (await nameInput.count()) > 0 &&
        (await nameInput.inputValue()) !== attendees[0].fullName
      ) {
        throw new Error('el checkout se remontó al enviar')
      }
    }

    const response = await responsePromise
    if (expectOk && !response.ok()) {
      throw new Error(`POST /api/tickets/orders → ${response.status()}`)
    }
  }).toPass({ timeout: 40_000 })

  if (expectOk) {
    await expect(page.locator('.ticket-purchase--confirmation')).toBeVisible({ timeout: 15_000 })
  }
}

/**
 * Selecciona un tipo de entrada para un asistente.
 *
 * En cantidad 1 (editorial) son radios de `TicketTypeOptions`. En lote son
 * chips `aria-pressed` dentro de la fila.
 */
export async function selectTicketType(page, index, typeName) {
  const form = page.locator('#checkout form.ticket-purchase')
  const radios = form.locator(`input[type="radio"][name="attendee-${index}-ticketTypeId"]`)
  if ((await radios.count()) > 0) {
    const option = form.locator('label.ticket-type-options__option').filter({ hasText: typeName })
    await option.click()
    await expect(option.locator('input[type="radio"]')).toBeChecked()
    return
  }

  const row = page
    .locator('.ticket-purchase__attendee-row, .ticket-purchase__attendees-batch-row')
    .nth(index)
  const typeButton = row.getByRole('button', { name: new RegExp(typeName, 'i') })
  await typeButton.click()
  await expect(typeButton).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Ajusta la cantidad de entradas (+ / -). El stepper editorial usa
 * `.ticket-purchase__stepper` y aria-labels "Sumar entrada" / "Restar entrada".
 */
export async function setTicketQuantity(page, quantity) {
  const stepper = page.locator('.ticket-purchase__stepper')
  await stepper.waitFor({ state: 'visible', timeout: 5_000 })
  const valueLocator = stepper.locator('span').first()
  const current = Number.parseInt((await valueLocator.textContent()) ?? '1', 10) || 1

  if (quantity > current) {
    const addButton = stepper.getByRole('button', { name: /sumar entrada/i })
    for (let i = current; i < quantity; i++) {
      await addButton.click()
    }
  } else if (quantity < current) {
    const removeButton = stepper.getByRole('button', { name: /restar entrada/i })
    for (let i = current; i > quantity; i--) {
      await removeButton.click()
    }
  }

  await expect(valueLocator).toHaveText(String(quantity))
}

/**
 * Selecciona el método de pago. Los radio buttons usan name="ticket-payment".
 */
export async function selectPaymentMethod(page, method) {
  const radio = page.locator(`input[name="ticket-payment"][value="${method}"]`)
  const option = page.locator(`label:has(input[name="ticket-payment"][value="${method}"])`)
  await expect(async () => {
    await option.waitFor({ state: 'visible', timeout: 5_000 })
    if (!(await radio.isChecked())) await option.click()
    await expect(radio).toBeChecked({ timeout: 2_000 })
  }).toPass({ timeout: 10_000 })
}

/**
 * Envía el formulario de compra de entradas. El CTA editorial dice "Pagar".
 */
export async function submitTicketPurchase(page) {
  const submitButton = page.locator('#checkout form.ticket-purchase .ticket-purchase__submit')
  await submitButton.waitFor({ state: 'visible', timeout: 5_000 })
  await submitButton.click()
}

/**
 * Verifica que la orden se haya creado exitosamente. La pantalla de
 * confirmación muestra un bloque con la info de la orden.
 *
 * `expectedQuantity` cuenta CREDENCIALES emitidas (filas), no compras: un
 * entrenador paga una vez y emite dos pases.
 */
export async function assertOrderCreated(page, { expectedAmount, expectedQuantity } = {}) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })

  if (expectedAmount) {
    await expect(confirmation).toContainText(expectedAmount)
  }
  if (expectedQuantity) {
    const quantityText =
      expectedQuantity === 1
        ? /1\s*(entrada|ticket)/i
        : new RegExp(`${expectedQuantity}\\s*(entradas|tickets)`, 'i')
    await expect(confirmation).toContainText(quantityText)
  }
}

/**
 * Pases emitidos en la confirmación (no el preview PREV- del hero).
 */
export function confirmationPasses(page) {
  return page.locator('.ticket-purchase--confirmation .ticket-purchase__pass-item')
}

/**
 * Verifica los pases de la confirmación: etiquetas, código TCK- y QR real.
 */
export async function assertPassesOnConfirmation(page, { labels, ticketCodePattern = TICKET_CODE } = {}) {
  const passes = confirmationPasses(page)
  if (labels?.length) {
    await expect(passes).toHaveCount(labels.length)
    const expectedCounts = new Map()
    for (const label of labels) {
      expectedCounts.set(label, (expectedCounts.get(label) ?? 0) + 1)
    }
    for (const [label, count] of expectedCounts) {
      await expect(
        page.locator('.ticket-purchase--confirmation .ticket-pass-preview__meta dd', {
          hasText: label,
        }),
      ).toHaveCount(count)
    }
  }

  const count = await passes.count()
  const tokens = []
  for (let index = 0; index < count; index += 1) {
    const pass = passes.nth(index)
    const code = (await pass.locator('.ticket-pass-preview__code').textContent())?.trim() ?? ''
    expect(code, 'el QR de confirmación no puede ser un preview PREV-').not.toMatch(/^PREV-/i)
    expect(code).toMatch(QR_TOKEN)
    tokens.push(code)
    await expect(pass.locator('.ticket-purchase__ticket-info')).toContainText(ticketCodePattern)
  }
  expect(new Set(tokens).size).toBe(tokens.length)
  return tokens
}

export async function assertTransferPanelVisible(page) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation.locator('.ticket-purchase__transfer-panel')).toBeVisible()
  await expect(confirmation.locator('.ticket-purchase__manual-note')).toBeVisible()
  await expect(confirmation).toContainText(/habilita cuando Administración aprueba/i)
  const transferData = confirmation.locator('.ticket-purchase__transfer-data')
  await expect(transferData).toBeVisible()
  await expect(transferData).toContainText(/alias/i)
  await expect(transferData).toContainText(/titular/i)
}

/**
 * Abre la URL pública de verificación de una entrada.
 */
export async function openTicketCredential(page, { qrToken, eventSlug }) {
  const params = new URLSearchParams({ credencial: qrToken, tipo: 'ticket' })
  if (eventSlug) params.set('evento', eventSlug)
  await page.goto(`/?${params.toString()}`)
  await page.waitForSelector('.credential-page', { timeout: 15_000 })
}

export async function assertCredentialPage(
  page,
  { name, ticketCode, label, zones, status, verdict },
) {
  const shell = page.locator('.credential-page')
  await expect(shell).toBeVisible()
  if (verdict) await expect(shell.locator('.credential-page__verdict-label')).toHaveText(verdict)
  if (name) await expect(shell.locator('.credential-page__athlete-name')).toHaveText(name)
  if (ticketCode) await expect(shell).toContainText(ticketCode)
  if (label) await expect(shell.locator('.credential-page__schedule-day')).toHaveText(label)
  if (zones?.length) {
    for (const zone of zones) {
      await expect(shell.locator('.credential-page__zones')).toContainText(zone)
    }
  }
  if (status) await expect(shell.locator('.status-pill')).toContainText(status)
}

export async function assertPurchaseError(page, { field, message }) {
  if (field) {
    const input = page.locator(`input[name="${field}"]`)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator(`#${field}-error`)).toBeVisible()
    if (message) await expect(page.locator(`#${field}-error`)).toContainText(message)
    return
  }
  const error = page.locator('.ticket-purchase__submit-error')
  await expect(error).toBeVisible({ timeout: 10_000 })
  if (message) await expect(error).toContainText(message)
}

/**
 * Verifica que la venta de entradas esté pausada (indicador de "próximamente").
 */
export async function assertSalesPaused(page) {
  const pausedText = page.locator('.tickets-page__sales-paused')
  await expect(pausedText).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('form.ticket-purchase')).toHaveCount(0)
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

export { TICKET_CODE, QR_TOKEN }
