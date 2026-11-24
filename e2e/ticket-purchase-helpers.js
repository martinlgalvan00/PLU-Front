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

// Cada acción dentro de un intento lleva su propio tope: sin él, si el form
// desaparece a mitad de camino (llegó la confirmación, o React lo remontó) el
// intento queda colgado esperando un nodo que no vuelve y `toPass` se come
// todo su presupuesto sin probar de nuevo.
const STEP_TIMEOUT = 5_000

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
  await nameInput.waitFor({ state: 'visible', timeout: STEP_TIMEOUT })
  await nameInput.fill(fullName, { timeout: STEP_TIMEOUT })
  await dniInput.fill(String(dni), { timeout: STEP_TIMEOUT })
  await expect(nameInput).toHaveValue(fullName, { timeout: 2_000 })
  await expect(dniInput).toHaveValue(digits, { timeout: 2_000 })
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
 * y el click, no hubo POST: se vuelve a recorrer en vez de afirmar a ciegas
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
  // En el paso de pago el botón del resumen es "Pagar": envía la compra.
  const submit = checkoutAction(page)
  const stepTitle = page.locator('#checkout .ticket-purchase__step-title')
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
      // Sólo cuenta en el paso de pago: en el de entradas, el botón arranca
      // deshabilitado hasta que se elige una.
      const onPayment = STEP_TITLES.payment.test((await stepTitle.textContent({ timeout: 1_000 }).catch(() => '')) ?? '')
      if (onPayment && (await submit.count()) > 0 && (await submit.isDisabled())) {
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
 * Filas de la billetera en una confirmación todavía pendiente.
 * Con el pago acreditado el pase queda abierto y estas filas no se dibujan.
 */
export function confirmationPasses(page) {
  return page.locator('.ticket-purchase--confirmation .buyer-tickets-wallet__row')
}

function foldLabel(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es-AR')
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
 * Verifica las credenciales de la confirmación y devuelve sus QR.
 *
 * Hasta acreditar, la billetera lista cada persona con el tipo y
 * "Se habilita cuando se acredite el pago". No dibuja el pase ni el token.
 * Acreditada, el pase queda abierto: el código impreso es el de puerta o el
 * TCK, y el token sale de la orden guardada para abrir la verificación.
 * Las etiquetas se comparan sin distinguir mayúsculas porque un rótulo en
 * mayúsculas ("ENTRENADOR") se muestra en título.
 */
export async function assertPassesOnConfirmation(page, { labels } = {}) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })

  const order = await readCurrentTicketOrder(page)
  const storedTickets = Array.isArray(order.tickets) ? order.tickets : []
  const scopedTickets = storedTickets.filter(
    (ticket) => !ticket.orderId || ticket.orderId === order.orderId,
  )
  const orderTickets = scopedTickets.length > 0 ? scopedTickets : storedTickets
  const approved = order.status === 'aprobado'
  const printed = await printedPassLabels(order)

  let shownTickets
  if (!approved) {
    const rows = confirmationPasses(page)
    await expect(rows).toHaveCount(labels?.length ?? orderTickets.length)
    shownTickets = []
    const used = new Set()
    const count = await rows.count()
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index)
      const name = (await row.locator('strong').innerText()).trim()
      const type = foldLabel(await row.locator('.buyer-tickets-wallet__row-type').innerText())
      const ticket = orderTickets.find(
        (item) =>
          !used.has(item.id) &&
          item.attendeeName === name &&
          foldLabel(printed.get(item.id)) === type,
      )
      expect(ticket, `la fila ${name} / ${type} no está en la orden en curso`).toBeTruthy()
      used.add(ticket.id)
      shownTickets.push(ticket)
      await expect(row).toContainText(/se habilita cuando se acredite el pago/i)
    }
    await expect(confirmation.locator('.ticket-pass-preview')).toHaveCount(0)
    await expect(confirmation.getByRole('button', { name: /ver mi entrada/i })).toHaveCount(0)
    if (labels?.length) {
      expect(countBy(shownTickets.map((ticket) => foldLabel(printed.get(ticket.id))))).toEqual(
        countBy(labels.map(foldLabel)),
      )
    }
  } else {
    const pass = confirmation.locator('.ticket-pass-preview')
    await expect(pass).toBeVisible()
    const code = (await pass.locator('.ticket-pass-preview__code').textContent())?.trim() ?? ''
    expect(code, 'el código de confirmación no puede ser un preview PREV-').not.toMatch(/^PREV-/i)
    expect(code.length).toBeGreaterThan(0)
    const guest = (await pass.locator('.ticket-pass-preview__guest').innerText()).trim()
    const ticket = orderTickets.find((item) => item.attendeeName === guest) ?? orderTickets[0]
    expect(ticket, 'el pase abierto no está en la orden en curso').toBeTruthy()
    await expect(pass.locator('.ticket-pass-preview__guest')).toHaveText(ticket.attendeeName)
    shownTickets = orderTickets
    if (labels?.length === 1) {
      expect(foldLabel(printed.get(ticket.id))).toBe(foldLabel(labels[0]))
    }
  }

  const tokens = shownTickets.map((ticket) => ticket.qrToken)
  for (const token of tokens) {
    expect(token).toMatch(QR_TOKEN)
    if (!approved) await expect(confirmation).not.toContainText(token)
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

/**
 * Confirmación de una compra pendiente vista por quien compró.
 * La billetera muestra el nombre y que el QR se habilita al acreditar.
 * El DNI y el código TCK quedan en la orden guardada: no se imprimen
 * mientras el pase está retenido.
 */
export async function assertCustomerConfirmation(page, { eventTitle, name, dni, amount }) {
  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })
  await expect(confirmation.getByRole('heading', { name: new RegExp(eventTitle, 'i') })).toBeVisible()
  await expect(confirmation).toContainText(/pendiente/i)
  await expect(confirmation).toContainText('Tu QR todavía no abre la puerta')
  await expect(confirmation).toContainText(/se habilita cuando se acredite el pago/i)
  if (name) await expect(confirmation).toContainText(name)
  const digits = String(dni).replace(/\D/g, '')
  const order = await readCurrentTicketOrder(page)
  const mine = order.tickets.filter((ticket) => ticket.attendeeDni === digits)
  expect(mine.length).toBeGreaterThan(0)
  for (const ticket of mine) expect(ticket.ticketCode).toMatch(TICKET_CODE)
  if (amount) await expect(confirmation).toContainText(amount)
}

/** El pase acreditado queda abierto en la confirmación, sin un modal aparte. */
export async function openTicketPassModal(page, { name } = {}) {
  const pass = page.locator('.ticket-purchase--confirmation .ticket-pass-preview')
  await expect(pass).toBeVisible()
  if (name) await expect(pass.locator('.ticket-pass-preview__guest')).toHaveText(name)
  return pass
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
