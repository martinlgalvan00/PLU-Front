import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { TICKETS_PATH } from '../src/lib/ticketsRoute.js'
import { FIXTURE_PATH } from './global-setup.js'

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

// Cada acción dentro de un intento lleva su propio tope: sin él, si el form
// desaparece a mitad de camino (llegó la confirmación, o React lo remontó) el
// intento queda colgado esperando un nodo que no vuelve y `toPass` se come
// todo su presupuesto sin probar de nuevo.
const STEP_TIMEOUT = 5_000

async function typeAttendee(page, index, { fullName, dni }) {
  const digits = String(dni).replace(/\D/g, '')
  const form = page.locator('#checkout form.ticket-purchase')
  const nameInput = form.locator(`input[name="attendee-${index}-fullName"]`)
  const dniInput = form.locator(`input[name="attendee-${index}-dni"]`)
  await nameInput.waitFor({ state: 'visible', timeout: STEP_TIMEOUT })
  await nameInput.fill(fullName, { timeout: STEP_TIMEOUT })
  await dniInput.fill(String(dni), { timeout: STEP_TIMEOUT })
  await expect(nameInput).toHaveValue(fullName, { timeout: 2_000 })
  await expect(dniInput).toHaveValue(digits, { timeout: 2_000 })
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
  { attendees, buyer, paymentMethod = 'transferencia', quantity } = {},
) {
  await expect(async () => {
    await applyTicketCheckout(page, { attendees, buyer, paymentMethod, quantity })
  }).toPass({ timeout: 20_000 })
}

async function applyTicketCheckout(
  page,
  { attendees, buyer, paymentMethod = 'transferencia', quantity },
) {
  const targetQuantity = quantity ?? attendees.length
  if (targetQuantity > 1) await setTicketQuantity(page, targetQuantity)

  for (const [index, attendee] of attendees.entries()) {
    await typeAttendee(page, index, attendee)
    if (attendee.type) await selectTicketType(page, index, attendee.type)
    if (attendee.addon) await toggleTicketAddon(page, attendee.addon, { index, selected: true })
  }

  // El comprador es quien recibe el QR por email y puede ser distinto de los
  // asistentes. Los tests que no necesitan ese caso usan un contacto válido
  // derivado del primer asistente; así recorren el formulario real completo.
  const first = attendees[0]
  const buyerData = buyer ?? {
    name: first.fullName,
    email: `e2e-ticket-${String(first.dni).replace(/\D/g, '')}@pluarg.test`,
  }
  await page
    .locator('#checkout input[name="buyer-name"]')
    .fill(buyerData.name, { timeout: STEP_TIMEOUT })
  await page
    .locator('#checkout input[name="buyer-email"]')
    .fill(buyerData.email, { timeout: STEP_TIMEOUT })
  if (buyerData.phone) {
    await page
      .locator('#checkout input[name="buyer-phone"]')
      .fill(buyerData.phone, { timeout: STEP_TIMEOUT })
  }

  await selectPaymentMethod(page, paymentMethod)
  await expect(page.locator('#checkout input[name="attendee-0-fullName"]')).toHaveValue(
    attendees[0].fullName,
    { timeout: 2_000 },
  )
  await expect(page.locator(`input[name="ticket-payment"][value="${paymentMethod}"]`)).toBeChecked(
    { timeout: 2_000 },
  )
}

/**
 * Espera lo que pasó después de tocar "Pagar": la confirmación, un rechazo del
 * backend, o un form que no llegó a mandar nada. Devuelve el motivo legible
 * para que un fallo en CI diga qué vio, no sólo "timeout".
 */
async function waitForPurchaseOutcome(page, { posts, sent, timeout = 25_000 }) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  const submitError = page.locator('#checkout form.ticket-purchase .ticket-purchase__submit-error')
  const invalidFields = page.locator('#checkout form.ticket-purchase [aria-invalid="true"]')
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (await confirmation.isVisible()) return { kind: 'confirmed' }

    const post = posts.slice(sent).at(-1)
    if (post && post.status >= 400) {
      const detail = post.body?.error ?? post.body?.message ?? ''
      return {
        kind: 'rejected',
        message: `POST /api/tickets/orders → ${post.status}${detail ? `: ${detail}` : ''}`,
      }
    }
    if (!post) {
      const invalid = await invalidFields.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('name') ?? node.id ?? node.tagName),
      )
      if (invalid.length) {
        return {
          kind: 'invalid',
          message: `el form no mandó la compra, marcó inválidos: ${invalid.join(', ')}`,
        }
      }
      if (await submitError.isVisible()) {
        return {
          kind: 'invalid',
          message: `el form no mandó la compra: ${(await submitError.innerText()).trim()}`,
        }
      }
    }
    await page.waitForTimeout(250)
  }

  return {
    kind: 'timeout',
    message:
      posts.length > sent
        ? `POST /api/tickets/orders → ${posts.at(-1).status}, pero la confirmación no apareció`
        : 'el click en "Pagar" no generó ningún POST /api/tickets/orders',
  }
}

/**
 * Compra por el formulario real. Si React remonta el checkout entre el fill
 * y el click, no hubo POST: se vuelve a llenar en vez de afirmar a ciegas
 * la pantalla de confirmación.
 *
 * Los POST se escuchan durante toda la compra (no sólo dentro de un intento):
 * una respuesta lenta que vuelve después de que el intento se rindió igual
 * cuenta, y el intento siguiente ve la confirmación en vez de volver a llenar
 * un form que ya no está. Devuelve el cuerpo del último POST aceptado.
 */
export async function purchaseTickets(
  page,
  { attendees, buyer, paymentMethod = 'transferencia', quantity, expectOk = true } = {},
) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  const submit = page.locator('#checkout form.ticket-purchase .ticket-purchase__submit')
  const posts = []
  const recordPost = (response) => {
    if (!isTicketOrderPost(response)) return
    const entry = { status: response.status(), body: null }
    posts.push(entry)
    response
      .json()
      .then((body) => {
        entry.body = body
      })
      .catch(() => {})
  }

  page.on('response', recordPost)
  try {
    await expect(async () => {
      if (expectOk && (await confirmation.isVisible())) return

      // Un POST anterior que todavía no volvió deja el botón en "Procesando…".
      // Llenar el form encima no cambia nada: se espera y el intento siguiente
      // decide con la pantalla que haya quedado.
      if ((await submit.count()) > 0 && (await submit.isDisabled())) {
        throw new Error('la compra anterior sigue en curso (botón "Procesando…")')
      }

      await applyTicketCheckout(page, { attendees, buyer, paymentMethod, quantity })
      const sent = posts.length
      await submit.click({ timeout: STEP_TIMEOUT })
      const outcome = await waitForPurchaseOutcome(page, { posts, sent })

      if (outcome.kind === 'confirmed') return
      // Sin `expectOk` el test busca justamente el rechazo: alcanza con que el
      // backend haya contestado.
      if (!expectOk && outcome.kind === 'rejected') return
      throw new Error(outcome.message)
    }).toPass({ timeout: 60_000 })
  } finally {
    page.off('response', recordPost)
  }

  if (expectOk) await expect(confirmation).toBeVisible({ timeout: 15_000 })
  return posts.findLast((post) => post.status < 400)?.body ?? null
}

/**
 * Selecciona un tipo de entrada para un asistente.
 *
 * El checkout editorial elige el tipo con un `<select>` por asistente.
 * El catálogo de ofertas queda en la vidriera, no se vuelve a pintar acá.
 */
export async function selectTicketType(page, index, typeName) {
  const form = page.locator('#checkout form.ticket-purchase')
  const select = form.locator(`select[name="attendee-${index}-ticketTypeId"]`)
  await expect(select).toBeVisible()
  const optionValue = await select.locator('option').evaluateAll((options, name) => {
    const needle = String(name).toLowerCase()
    const match = options.find((option) => (option.textContent ?? '').toLowerCase().includes(needle))
    return match?.value ?? null
  }, typeName)
  if (!optionValue) {
    throw new Error(`tipo "${typeName}" no está en el select de la entrada ${index + 1}`)
  }
  // En CI se vio el select volver al tipo anterior justo después de elegir
  // (toHaveValue esperó 10 s con el valor viejo). Se vuelve a elegir en vez de
  // esperar a un valor que ya no va a llegar solo.
  await expect(async () => {
    await select.selectOption(optionValue, { timeout: STEP_TIMEOUT })
    await expect(select).toHaveValue(optionValue, { timeout: 2_000 })
  }).toPass({ timeout: 10_000 })
}

/**
 * Ajusta la cantidad de entradas (+ / -). El stepper editorial usa
 * `.ticket-purchase__stepper` y aria-labels "Sumar entrada" / "Restar entrada".
 */
export async function setTicketQuantity(page, quantity) {
  const stepper = page.locator('.ticket-purchase__stepper')
  await stepper.waitFor({ state: 'visible', timeout: STEP_TIMEOUT })
  const valueLocator = stepper.locator('span').first()
  const current =
    Number.parseInt((await valueLocator.textContent({ timeout: STEP_TIMEOUT })) ?? '1', 10) || 1

  if (quantity > current) {
    const addButton = stepper.getByRole('button', { name: /sumar entrada/i })
    for (let i = current; i < quantity; i++) {
      await addButton.click({ timeout: STEP_TIMEOUT })
    }
  } else if (quantity < current) {
    const removeButton = stepper.getByRole('button', { name: /restar entrada/i })
    for (let i = current; i > quantity; i--) {
      await removeButton.click({ timeout: STEP_TIMEOUT })
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
 * La orden en curso tal como la guarda la app (sessionStorage), con sus
 * credenciales. Es de donde la confirmación se rehidrata al recargar, así que
 * lo que hay acá es exactamente lo que la pantalla está mostrando.
 */
export async function readCurrentTicketOrder(page) {
  let order = null
  await expect
    .poll(
      async () => {
        order = await page.evaluate((key) => {
          try {
            return JSON.parse(window.sessionStorage.getItem(key) ?? 'null')
          } catch {
            return null
          }
        }, CURRENT_ORDER_KEY)
        return order?.type === 'tickets' && Array.isArray(order.tickets) ? order.tickets.length : 0
      },
      { message: 'la orden de entradas no quedó guardada en sessionStorage', timeout: 10_000 },
    )
    .toBeGreaterThan(0)
  return order
}

/**
 * Nombres de los tipos de la fixture (global-setup.js). Las credenciales que
 * devuelve la compra traen el id del tipo, no el nombre; la confirmación lo
 * resuelve con el catálogo del evento y acá con lo que sembró el setup.
 */
let fixtureTypeNames
function fixtureTicketTypeNames() {
  fixtureTypeNames ??= readFile(FIXTURE_PATH, 'utf8').then((raw) => {
    const fixture = JSON.parse(raw)
    return new Map([
      [fixture.coachTypeId, 'Entrenadores'],
      [fixture.generalTypeId, 'Público general'],
      [fixture.vipTypeId, 'VIP'],
    ])
  })
  return fixtureTypeNames
}

/**
 * Lo que imprime cada pase, con la misma regla que `TicketPurchaseSection`:
 * la etiqueta de la credencial sólo cuando la compra de esa persona emitió más
 * de una (entrenador: "Espectador" + "ENTRENADOR"); si no, el nombre del tipo.
 */
async function printedPassLabels(order) {
  const typeNames = await fixtureTicketTypeNames()
  const tickets = order.tickets.filter((ticket) => ticket.orderId === order.orderId)
  const bundleSize = new Map()
  for (const ticket of tickets) {
    const key = ticket.bundleId ?? ticket.id
    bundleSize.set(key, (bundleSize.get(key) ?? 0) + 1)
  }
  return new Map(
    tickets.map((ticket) => [
      ticket.id,
      (bundleSize.get(ticket.bundleId ?? ticket.id) > 1 ? ticket.credentialLabel : null) ??
        ticket.ticketTypeName ??
        typeNames.get(ticket.ticketTypeId) ??
        '',
    ]),
  )
}

function countBy(values) {
  const counts = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

/**
 * Verifica los pases de la confirmación y devuelve sus QR.
 *
 * Desde que el QR se retiene hasta acreditar el pago (TicketPurchaseSection,
 * `qrReady`), la confirmación de una orden pendiente ya no dibuja el pase: cada
 * credencial muestra DNI · código TCK y "QR pendiente de habilitación", sin
 * QR ni "Ver mi entrada". Por eso:
 *
 * - Pendiente: se afirma que el QR NO se filtra, y las etiquetas se comparan
 *   con lo que esos pases van a imprimir al habilitarse (orden guardada).
 * - Aprobada: el pase está dibujado y se lee la etiqueta y el QR de la pantalla.
 *
 * En los dos casos los tokens salen de la credencial que muestra cada fila
 * (por su código TCK), así que siguen sirviendo para abrir la verificación.
 */
export async function assertPassesOnConfirmation(page, { labels, ticketCodePattern = TICKET_CODE } = {}) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })
  const passes = confirmationPasses(page)
  if (labels?.length) await expect(passes).toHaveCount(labels.length)

  const order = await readCurrentTicketOrder(page)
  const approved = order.status === 'aprobado'
  const count = await passes.count()
  const shownTickets = []

  for (let index = 0; index < count; index += 1) {
    const pass = passes.nth(index)
    const info = pass.locator('.ticket-purchase__ticket-info')
    await expect(info).toContainText(ticketCodePattern)
    const code = (await info.innerText()).match(TICKET_CODE)?.[0]
    const ticket = order.tickets.find((item) => item.ticketCode === code)
    expect(ticket, `el pase ${code} no está en la orden en curso`).toBeTruthy()
    await expect(info).toContainText(`DNI ${ticket.attendeeDni}`)
    shownTickets.push(ticket)

    if (approved) {
      const qr = (await pass.locator('.ticket-pass-preview__code').textContent())?.trim() ?? ''
      expect(qr, 'el QR de confirmación no puede ser un preview PREV-').not.toMatch(/^PREV-/i)
      expect(qr).toBe(ticket.qrToken)
      await expect(pass.locator('.ticket-pass-preview__guest')).toHaveText(ticket.attendeeName)
    } else {
      await expect(pass.locator('.ticket-pass-preview')).toHaveCount(0)
      await expect(pass).toContainText('QR pendiente de habilitación')
      await expect(pass.getByRole('button', { name: /ver mi entrada/i })).toHaveCount(0)
    }
  }

  if (labels?.length) {
    if (approved) {
      for (const [label, expected] of Object.entries(countBy(labels))) {
        await expect(
          confirmation.locator('.ticket-pass-preview__meta dd', { hasText: label }),
        ).toHaveCount(expected)
      }
    } else {
      const printed = await printedPassLabels(order)
      expect(countBy(shownTickets.map((ticket) => printed.get(ticket.id)))).toEqual(
        countBy(labels),
      )
    }
  }

  const tokens = shownTickets.map((ticket) => ticket.qrToken)
  for (const token of tokens) expect(token).toMatch(QR_TOKEN)
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

/**
 * Confirmación de una compra pendiente vista por quien compró. `name` es
 * opcional: con el QR retenido hasta acreditar, una entrada suelta ya no
 * muestra el nombre del asistente (sólo DNI · código); un juego de varias
 * credenciales sí lo dice en el encabezado ("Credenciales de …").
 */
export async function assertCustomerConfirmation(page, { eventTitle, name, dni, amount }) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })
  await expect(confirmation.getByRole('heading', { name: new RegExp(eventTitle, 'i') })).toBeVisible()
  await expect(confirmation).toContainText(/pendiente/i)
  await expect(confirmation).toContainText('Tu QR todavía no abre la puerta')
  if (name) await expect(confirmation).toContainText(name)
  await expect(confirmation).toContainText(`DNI ${String(dni).replace(/\D/g, '')}`)
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

function proofUpload(page) {
  return page.locator('.ticket-purchase--confirmation .ticket-purchase__proof-upload')
}

/**
 * Elige un comprobante válido. El archivo se valida al elegirlo: si pasa, la
 * zona de carga muestra su nombre y aparece "Enviar comprobante".
 */
export async function chooseTicketProofFile(page, { name, mimeType, buffer }) {
  const upload = proofUpload(page)
  await upload.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  await expect(upload.locator('.ticket-purchase__proof-dropzone')).toContainText(name)
  await expect(upload.getByRole('button', { name: /enviar comprobante/i })).toBeVisible()
}

/**
 * Elige un comprobante que la pantalla tiene que rechazar (formato o peso).
 * El rechazo es inmediato, antes de subir nada: el archivo no queda elegido y
 * no se ofrece "Enviar comprobante".
 */
export async function rejectTicketProofFile(page, { name, mimeType, buffer, message }) {
  const upload = proofUpload(page)
  await upload.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  await expect(upload.locator('.ticket-purchase__submit-error')).toContainText(message)
  await expect(upload.locator('.ticket-purchase__proof-dropzone')).not.toContainText(name)
  await expect(upload.getByRole('button', { name: /enviar comprobante/i })).toHaveCount(0)
}

export async function submitTicketProof(page) {
  await proofUpload(page).getByRole('button', { name: /enviar comprobante/i }).click()
}
