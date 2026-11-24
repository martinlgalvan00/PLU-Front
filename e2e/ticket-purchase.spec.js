import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import {
  navigateToTickets,
  assertTicketTypeVisible,
  purchaseTickets,
  assertOrderCreated,
  assertPassesOnConfirmation,
  readCurrentTicketOrder,
  assertTransferPanelVisible,
  setTicketQuantity,
  assertLiveTotal,
  assertCheckoutStep,
  checkoutAction,
  continueCheckout,
  fillReadyTicketCheckout,
  openCheckoutStep,
  selectEventOption,
  assertAddonIncluded,
  assertPaymentMethodsVisible,
  assertCheckoutVisible,
  assertSalesPaused,
  navigateFromEventToTickets,
  selectPaymentMethod,
} from './ticket-purchase-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

/**
 * Compra pública de entradas — el formulario, no la RPC.
 *
 * El arnés tiene que entregar el proxy de `/api` al puerto E2E y el
 * interruptor `ticket` de la org QA. El flag Vite es solo un freno de
 * emergencia: si está en `false` la página muestra "Próximamente" aunque
 * el panel esté abierto.
 *
 * La emisión por RPC y el canje por zona siguen en `ticket-credentials.spec.js`.
 * El pack de entrenador (2 QR) se cubre en `ticket-credential-verify.spec.js`.
 */
test.describe('Venta de Entradas', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })
  test('la vidriera lista cada tipo y la matriz dice qué zona abre', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await assertTicketTypeVisible(page, 'Entrenadores', '10.000', {
      credentials: /2 credenciales · 2 QR/i,
      quotaNote: /un solo lugar/i,
    })
    await assertTicketTypeVisible(page, 'Público general', '20.000', {
      credentials: /1 credencial · 1 QR/i,
    })
    await assertTicketTypeVisible(page, 'VIP', '35.000', {
      credentials: /1 credencial · 1 QR/i,
      includes: fixture.ticketAddonLabel,
    })

    const access = page.locator('.tickets-page__access')
    await expect(access).toBeVisible()

    const generalZone = access.locator('.tickets-page__access-zone', {
      has: page.getByRole('heading', { name: 'Puerta general' }),
    })
    await expect(generalZone).toContainText(/todas las entradas/i)

    const warmupZone = access.locator('.tickets-page__access-zone', {
      has: page.getByRole('heading', { name: 'Entrada en calor' }),
    })
    await expect(warmupZone.locator('.tickets-page__access-opens')).toContainText('Entrenadores')
    const warmupClosed = warmupZone.locator('.tickets-page__access-closed')
    await expect(warmupClosed).toContainText(/no la abren/i)
    await expect(warmupClosed).toContainText('Público general')
    // La matriz pasa a formato título los nombres cargados en mayúsculas
    // (`shortTicketTypeName`), así que "VIP" se lee "Vip". Lo que importa acá
    // es que figure entre los que no abren la zona, no cómo se capitaliza.
    await expect(warmupClosed).toContainText('VIP', { ignoreCase: true })
  })

  test('el total sigue al tipo, a la cantidad y al beneficio extra', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    // Con varios tipos se arranca en cero: nadie paga un tipo que no eligió.
    await expect(checkoutAction(page)).toBeDisabled()

    await setTicketQuantity(page, 1, 'Público general')
    await assertLiveTotal(page, '20.000')

    await continueCheckout(page)
    await assertCheckoutStep(page, 'buyer')
    await page.locator('.ticket-purchase__addon', { hasText: fixture.ticketAddonLabel }).click()
    await assertLiveTotal(page, '28.000')

    await openCheckoutStep(page, 'tickets')
    await setTicketQuantity(page, 0, 'Público general')
    await setTicketQuantity(page, 1, 'VIP')
    await assertLiveTotal(page, '35.000')
    await continueCheckout(page)
    await assertAddonIncluded(page, fixture.ticketAddonLabel)

    await openCheckoutStep(page, 'tickets')
    await setTicketQuantity(page, 1, 'Entrenadores')
    await assertLiveTotal(page, '45.000')
    await continueCheckout(page)
    await expect(page.locator('input[name="attendee-1-fullName"]')).toBeVisible()

    await openCheckoutStep(page, 'tickets')
    await setTicketQuantity(page, 0, 'Entrenadores')
    await assertLiveTotal(page, '35.000')
  })

  test('cambiar de evento pausa o reabre el checkout', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await assertCheckoutVisible(page)

    await selectEventOption(page, fixture.pausedEventTitle)
    await assertSalesPaused(page)

    await selectEventOption(page, fixture.ticketEventTitle)
    await assertCheckoutVisible(page)
    await assertTicketTypeVisible(page, 'VIP', '35.000')
    // Cambiar de evento arranca una compra nueva, en el primer paso.
    await assertCheckoutStep(page, 'tickets')
    await expect(checkoutAction(page)).toBeDisabled()
  })

  test('desde la ficha del evento se abre el checkout', async ({ page }) => {
    await navigateFromEventToTickets(page, fixture.ticketEventSlug, {
      title: fixture.ticketEventTitle,
    })
    await assertTicketTypeVisible(page, 'Público general', '20.000')
    await assertCheckoutStep(page, 'tickets')
  })

  test('permite comprar una entrada VIP por transferencia', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Valeria VIP', dni: '40888999', type: 'VIP' }],
    })
    await assertOrderCreated(page, { expectedAmount: '35.000', expectedQuantity: 1 })
    const tokens = await assertPassesOnConfirmation(page, { labels: ['VIP'] })
    expect(tokens).toHaveLength(1)
    await expect(page.locator('.ticket-purchase--confirmation')).toContainText(
      fixture.ticketAddonLabel,
    )
  })

  test('un adicional de merch suma al total de público general', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [
        {
          fullName: 'Tomi Remera',
          dni: '40999111',
          type: 'Público general',
          addon: fixture.ticketAddonLabel,
        },
      ],
    })
    await assertOrderCreated(page, { expectedAmount: '28.000', expectedQuantity: 1 })
    await assertTransferPanelVisible(page)
    await expect(page.locator('.ticket-purchase--confirmation')).toContainText(
      fixture.ticketAddonLabel,
    )
    await expect(page.locator('.ticket-purchase__transfer-data')).toContainText('28.000')
  })

  test('permite comprar una entrada de público general por transferencia', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await assertTicketTypeVisible(page, 'Entrenadores', '10.000')
    await assertTicketTypeVisible(page, 'Público general', '20.000')

    await purchaseTickets(page, {
      attendees: [{ fullName: 'Juan Público', dni: '40111222', type: 'Público general' }],
    })

    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
    await assertTransferPanelVisible(page)
    const tokens = await assertPassesOnConfirmation(page, { labels: ['Público general'] })
    expect(tokens).toHaveLength(1)
    // Pendiente de pago, la fila muestra a la persona. El pase se dibuja al acreditar.
    await expect(page.locator('.buyer-tickets-wallet__row')).toContainText('Juan Público')
  })

  test('dos entradas generales suman el doble y emiten dos pases', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      quantity: 2,
      attendees: [
        { fullName: 'Lina General', dni: '41222333', type: 'Público general' },
        { fullName: 'Tito General', dni: '41333444', type: 'Público general' },
      ],
    })
    await assertOrderCreated(page, { expectedAmount: '40.000', expectedQuantity: 2 })
    await assertPassesOnConfirmation(page, {
      labels: ['Público general', 'Público general'],
    })
  })

  test('volver a transferencia después de Mercado Pago cierra la compra manual', async ({
    page,
  }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await fillReadyTicketCheckout(page, {
      attendees: [{ fullName: 'Nico Canal', dni: '41444555', type: 'Público general' }],
      paymentMethod: 'mercado_pago',
    })
    await assertPaymentMethodsVisible(page)
    await selectPaymentMethod(page, 'transferencia')
    await continueCheckout(page)
    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
    await assertTransferPanelVisible(page)
  })

  test('una compra mixta emite tres pases: general + bundle de entrenador', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    await purchaseTickets(page, {
      quantity: 2,
      attendees: [
        { fullName: 'Ana Pública', dni: '40222333', type: 'Público general' },
        { fullName: 'Pepe Entrenador', dni: '40333444', type: 'Entrenadores' },
      ],
    })

    // 1 general + 2 del entrenador. El copy cuenta credenciales, no compras.
    await assertOrderCreated(page, { expectedAmount: '30.000', expectedQuantity: 3 })
    await assertTransferPanelVisible(page)
    await assertPassesOnConfirmation(page, {
      labels: ['Público general', 'Espectador', 'ENTRENADOR'],
    })
    await expect(page.locator('.ticket-purchase--confirmation')).toContainText(/2 credenciales/i)
  })

  test('recargar la página conserva la confirmación y el QR', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Rita Recarga', dni: '40123456', type: 'Público general' }],
    })
    const tokens = await assertPassesOnConfirmation(page, { labels: ['Público general'] })
    const heldRow = page.locator('.ticket-purchase--confirmation .buyer-tickets-wallet__row')
    const shownBefore = await heldRow.allInnerTexts()

    await page.reload()
    await expect(page.locator('.ticket-purchase--confirmation')).toBeVisible({ timeout: 15_000 })
    await expect(heldRow).toHaveText(shownBefore)
    await expect(heldRow.first()).toContainText('Rita Recarga')
    const reloaded = await assertPassesOnConfirmation(page, { labels: ['Público general'] })
    expect(reloaded).toEqual(tokens)
  })

  test('un DNI con puntos se limpia y la compra sale', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Nora Puntos', dni: '40.555.666', type: 'Público general' }],
    })
    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
    const order = await readCurrentTicketOrder(page)
    expect(order.tickets.map((ticket) => ticket.attendeeDni)).toContain('40555666')
    await expect(page.locator('.buyer-tickets-wallet__row')).toContainText('Nora Puntos')
  })
})
