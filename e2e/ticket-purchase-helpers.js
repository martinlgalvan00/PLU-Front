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
 * "Cargando…" y el hero nunca aparece. Reintentar la navegación recupera el
 * arnés cuando el servidor local está ocupado después de muchos tests.
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

  let pending
  let lastHeroError
  for (const timeout of [8_000, 20_000, 30_000]) {
    pending = await openTicketsPage()
    try {
      await waitForTicketsHero(page, timeout)
      lastHeroError = null
      break
    } catch (error) {
      lastHeroError = error
    }
  }
  if (lastHeroError) throw lastHeroError
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
    // La compra arranca en el selector de entradas, sin scrollear ni abrir
    // nada: es lo primero que tiene que estar listo.
    await page
      .locator('#checkout .ticket-type-options--picker')
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
 * Verifica que un tipo de entrada sea visible en el selector del checkout.
 * La vidriera y el lugar donde se elige son la misma lista: cada fila es un
 * tipo con su precio, lo que abre y su contador.
 */
export async function assertTicketTypeVisible(page, name, priceText, extras = {}) {
  const picker = page.locator('#checkout .ticket-type-options--picker')
  const offer = picker.locator('.ticket-type-options__option', { hasText: name })
  await expect(offer).toBeVisible({ timeout: 5_000 })
  await expect(offer).toContainText(priceText)
  if (extras.credentials) await expect(offer).toContainText(extras.credentials)
  if (extras.quotaNote) await expect(offer).toContainText(extras.quotaNote)
  if (extras.includes) await expect(offer).toContainText(extras.includes)
}

/** Total del resumen de la compra (columna en desktop, barra abajo en mobile). */
export function liveTotal(page) {
  return page.locator('#checkout .ticket-flow-summary__total strong')
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

// ── Pasos del checkout ─────────────────────────────────────────────────────
// Entradas → Tus datos → Pago. Cada paso reemplaza al anterior en pantalla y
// el único botón de avance vive en el resumen (`.ticket-flow-summary__action`).

const STEP_TITLES = {
  tickets: /elegí tus entradas/i,
  buyer: /tus datos/i,
  payment: /cómo pagás/i,
}
const STEP_NAV_LABELS = { tickets: /volver a entradas/i, buyer: /volver a tus datos/i }

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function checkoutAction(page) {
  return page.locator('#checkout .ticket-flow-summary__action')
}

export async function assertCheckoutStep(page, step) {
  await expect(page.locator('#checkout .ticket-purchase__step-title')).toHaveText(STEP_TITLES[step])
}

/** Avanza un paso con el botón del resumen (en el último paso, envía la compra). */
export async function continueCheckout(page) {
  await checkoutAction(page).click()
}

/** Vuelve a un paso ya hecho desde la barra de pasos. */
export async function openCheckoutStep(page, step) {
  const title = page.locator('#checkout .ticket-purchase__step-title')
  if (STEP_TITLES[step].test((await title.textContent()) ?? '')) return
  await page
    .locator('#checkout .ticket-flow-steps')
    .getByRole('button', { name: STEP_NAV_LABELS[step] })
    .click()
  await assertCheckoutStep(page, step)
}

function quantityGroup(page, typeName) {
  return typeName
    ? page.getByRole('group', { name: new RegExp(`^Cantidad de ${escapeRegExp(typeName)}`, 'i') })
    : page.locator('#checkout .ticket-type-options__stepper').first()
}

/**
 * Deja un tipo de entrada en una cantidad exacta con su contador (+ / −).
 * Sin `typeName` usa el primer tipo del catálogo.
 */
export async function setTicketQuantity(page, quantity, typeName) {
  const group = quantityGroup(page, typeName)
  await group.waitFor({ state: 'visible', timeout: 5_000 })
  const output = group.locator('output')
  const current = Number.parseInt((await output.textContent()) ?? '0', 10) || 0
  const add = group.getByRole('button', { name: /^sumar/i })
  const remove = group.getByRole('button', { name: /^restar/i })
  for (let i = current; i < quantity; i++) await add.click()
  for (let i = current; i > quantity; i--) await remove.click()
  await expect(output).toHaveText(String(quantity))
}

/** Nombres de los tipos en el orden del selector (el mismo de las tarjetas). */
async function pickerTypeNames(page) {
  return page
    .locator('#checkout .ticket-type-options--picker .ticket-type-options__name')
    .allTextContents()
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
 * Llena nombre y DNI de una entrada por su posición en el paso de datos
 * (0-indexed, en el orden del catálogo).
 */
export async function fillAttendeeForm(page, index, attendee) {
  await expect(async () => {
    await typeAttendee(page, index, attendee)
  }).toPass({ timeout: 15_000 })
}

export async function fillBuyerForm(page, { name, email, phone }) {
  await page.locator('#checkout input[name="buyer-name"]').fill(name)
  await page.locator('#checkout input[name="buyer-email"]').fill(email)
  if (phone) await page.locator('#checkout input[name="buyer-phone"]').fill(phone)
}

/**
 * Deja el checkout en el paso de pago, listo para enviar. Reintenta si el
 * catálogo o la disponibilidad remontan el form y se llevan lo cargado.
 */
export async function fillReadyTicketCheckout(
  page,
  { attendees, buyer, paymentMethod = 'transferencia', quantity } = {},
) {
  await expect(async () => {
    await applyTicketCheckout(page, { attendees, buyer, paymentMethod, quantity })
  }).toPass({ timeout: 30_000 })
}

/**
 * Recorre los tres pasos como una persona: cantidades por tipo, datos de
 * quien compra y de cada entrada, y medio de pago.
 *
 * Las tarjetas del paso de datos salen agrupadas por tipo en el orden del
 * catálogo, no en el orden de `attendees`: cada asistente se escribe en la
 * primera tarjeta libre de su tipo.
 */
async function applyTicketCheckout(
  page,
  { attendees, buyer, paymentMethod = 'transferencia', quantity },
) {
  await openCheckoutStep(page, 'tickets')
  const typeNames = await pickerTypeNames(page)
  const typeOf = (attendee) => attendee.type ?? typeNames[0]

  const counts = new Map(typeNames.map((name) => [name, 0]))
  for (const attendee of attendees) {
    const name = typeNames.find((candidate) =>
      candidate.toLowerCase().includes(typeOf(attendee).toLowerCase()),
    )
    if (!name) throw new Error(`tipo "${typeOf(attendee)}" no está en el selector`)
    counts.set(name, counts.get(name) + 1)
  }
  const extra = (quantity ?? attendees.length) - attendees.length
  if (extra > 0) {
    const name = typeNames.find((candidate) =>
      candidate.toLowerCase().includes(typeOf(attendees[0]).toLowerCase()),
    )
    counts.set(name, counts.get(name) + extra)
  }
  for (const [name, count] of counts) await setTicketQuantity(page, count, name)

  await continueCheckout(page)
  await assertCheckoutStep(page, 'buyer')

  // El comprador es quien recibe el QR por email y puede ser distinto de los
  // asistentes. Los tests que no necesitan ese caso usan un contacto válido
  // derivado del primer asistente; así recorren el formulario real completo.
  const first = attendees[0]
  await fillBuyerForm(
    page,
    buyer ?? {
      name: first.fullName,
      email: `e2e-ticket-${String(first.dni).replace(/\D/g, '')}@pluarg.test`,
    },
  )

  const cardTypes = await page
    .locator('#checkout .ticket-purchase__attendee-card .ticket-purchase__attendee-type')
    .allTextContents()
  const used = new Set()
  for (const attendee of attendees) {
    const index = cardTypes.findIndex(
      (cardType, position) =>
        !used.has(position) && cardType.toLowerCase().includes(typeOf(attendee).toLowerCase()),
    )
    if (index < 0) throw new Error(`no hay tarjeta libre de tipo "${typeOf(attendee)}"`)
    used.add(index)
    await typeAttendee(page, index, attendee)
    if (attendee.addon) await toggleTicketAddon(page, attendee.addon, { index, selected: true })
  }
  // Un lote con filas a propósito vacías se queda en este paso: el test
  // verifica justamente que no se pueda avanzar.
  if ((quantity ?? attendees.length) > attendees.length) return

  await continueCheckout(page)
  await assertCheckoutStep(page, 'payment')
  await selectPaymentMethod(page, paymentMethod)
  expect(
    await page.locator(`input[name="ticket-payment"][value="${paymentMethod}"]`).isChecked(),
  ).toBe(true)
}

/**
 * Compra por el formulario real. Si React remonta el checkout entre el fill
 * y el click, no hubo POST: se vuelve a recorrer en vez de afirmar a ciegas
 * la pantalla de confirmación.
 */
export async function purchaseTickets(
  page,
  { attendees, buyer, paymentMethod = 'transferencia', quantity, expectOk = true } = {},
) {
  await expect(async () => {
    if (expectOk && (await page.locator('.ticket-purchase--confirmation').isVisible())) return

    await applyTicketCheckout(page, { attendees, buyer, paymentMethod, quantity })
    const responsePromise = page.waitForResponse(isTicketOrderPost, { timeout: 8_000 })
    await continueCheckout(page)

    const response = await responsePromise
    if (expectOk && !response.ok()) {
      throw new Error(`POST /api/tickets/orders → ${response.status()}`)
    }
  }).toPass({ timeout: 60_000 })

  if (expectOk) {
    await expect(page.locator('.ticket-purchase--confirmation')).toBeVisible({ timeout: 15_000 })
  }
}

/**
 * Selecciona el método de pago (tercer paso). Los radios usan
 * name="ticket-payment".
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
 * Toca el botón del resumen: en el paso de datos valida y avanza; en el de
 * pago envía la compra.
 */
export async function submitTicketPurchase(page) {
  const submitButton = checkoutAction(page)
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
  const verificationPath = `/api/tickets/verify/${encodeURIComponent(qrToken)}`
  let lastVerificationError

  for (const timeout of [15_000, 20_000, 30_000]) {
    const response = page
      .waitForResponse((candidate) => candidate.url().includes(verificationPath), { timeout })
      .catch(() => null)
    await page.goto(`/?${params.toString()}`)
    await page.waitForSelector('.credential-page', { timeout })
    await response
    try {
      await expect(page.locator('.credential-page__verdict-label')).not.toHaveText('Verificando…', {
        timeout,
      })
      return
    } catch (error) {
      lastVerificationError = error
    }
  }

  throw lastVerificationError
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

/** JPEG 1×1 válido: alcanza para el upload de comprobante. */
export const MINIMAL_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc40014100100000000000000000000000000000affda00080001000100003f00aaffd9',
  'hex',
)

export const OVERSIZED_JPEG = Buffer.concat([MINIMAL_JPEG, Buffer.alloc(2 * 1024 * 1024 + 1, 0xff)])

export async function assertCustomerConfirmation(page, { eventTitle, name, dni, amount }) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })
  await expect(confirmation.getByRole('heading', { name: new RegExp(eventTitle, 'i') })).toBeVisible()
  await expect(confirmation).toContainText(/pendiente/i)
  await expect(confirmation).toContainText(name)
  await expect(confirmation).toContainText(String(dni).replace(/\D/g, ''))
  await expect(confirmation).toContainText(TICKET_CODE)
  if (amount) await expect(confirmation).toContainText(amount)
}

export async function openTicketPassModal(page, { name } = {}) {
  await page.getByRole('button', { name: /ver mi entrada/i }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  if (name) await expect(dialog).toContainText(name)
  return dialog
}

export async function chooseTicketProofFile(page, { name, mimeType, buffer }) {
  const input = page.locator('.ticket-purchase__proof-upload input[type="file"]')
  await input.setInputFiles({ name, mimeType, buffer })
  await expect(page.locator('.ticket-purchase__proof-upload')).toContainText(name)
}

export async function submitTicketProof(page) {
  await page.getByRole('button', { name: /enviar comprobante/i }).click()
}
