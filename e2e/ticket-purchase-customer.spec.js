import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { TICKETS_PATH } from '../src/lib/ticketsRoute.js'
import {
  navigateToTickets,
  navigateFromEventToTickets,
  purchaseTickets,
  assertOrderCreated,
  assertPassesOnConfirmation,
  assertTransferPanelVisible,
  assertCheckoutVisible,
  assertLiveTotal,
  selectTicketType,
  toggleTicketAddon,
  assertCustomerConfirmation,
  openTicketPassModal,
  chooseTicketProofFile,
  submitTicketProof,
  openTicketCredential,
  assertCredentialPage,
  acceptCookies,
  MINIMAL_JPEG,
  OVERSIZED_JPEG,
} from './ticket-purchase-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

/**
 * Lo que hace un cliente de tribuna, de punta a punta: llega sin cuenta,
 * compra, ve cómo pagar, mira su pase y entiende que el QR todavía no entra.
 */
test.describe('Cliente — flujo de compra de entradas', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })

  test('compra desde el calendario, ve el pase y la credencial queda pendiente', async ({
    page,
    browser,
  }) => {
    await page.goto('/')
    await acceptCookies(page)
    await expect(page.getByRole('banner').getByRole('button', { name: /^Acceder$/i })).toBeVisible()

    await navigateFromEventToTickets(page, fixture.ticketEventSlug, {
      title: fixture.ticketEventTitle,
    })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Camila Cliente', dni: '42111222', type: 'Público general' }],
    })

    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
    await assertCustomerConfirmation(page, {
      eventTitle: fixture.ticketEventTitle,
      name: 'Camila Cliente',
      dni: '42111222',
      amount: '20.000',
    })
    await assertTransferPanelVisible(page)
    const tokens = await assertPassesOnConfirmation(page, { labels: ['Público general'] })
    expect(tokens).toHaveLength(1)

    const dialog = await openTicketPassModal(page, { name: 'Camila Cliente' })
    await dialog.locator('.card-modal__close').click()
    await expect(dialog).toHaveCount(0)

    await page.goto('/')
    await page.goto(`${TICKETS_PATH}?evento=${encodeURIComponent(fixture.ticketEventSlug)}`)
    await expect(page.locator('.ticket-purchase--confirmation')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.ticket-purchase--confirmation')).toContainText('Camila Cliente')

    await openTicketCredential(page, {
      qrToken: tokens[0],
      eventSlug: fixture.ticketEventSlug,
    })
    await assertCredentialPage(page, {
      name: 'Camila Cliente',
      verdict: 'Revisar antes de ingresar',
      status: 'Pendiente de pago',
    })
    await expect(page.getByRole('button', { name: /marcar ingreso/i })).toHaveCount(0)

    const stranger = await browser.newContext()
    const strangerPage = await stranger.newPage()
    try {
      await navigateToTickets(strangerPage, fixture.ticketEventSlug, {
        title: fixture.ticketEventTitle,
      })
      await expect(strangerPage.locator('.ticket-purchase--confirmation')).toHaveCount(0)
      await assertCheckoutVisible(strangerPage)
    } finally {
      await stranger.close()
    }
  })

  test('el hero lleva al checkout, se puede volver, y el adicional se puede sacar', async ({
    page,
  }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    await page.locator('a.tickets-page__hero-cta').click()
    await expect(page.locator('#checkout')).toBeInViewport()
    await assertCheckoutVisible(page)

    await expect(page.getByRole('button', { name: /restar entrada/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /sumar entrada/i })).toBeEnabled()

    await selectTicketType(page, 0, 'Público general')
    await assertLiveTotal(page, '20.000')
    await toggleTicketAddon(page, fixture.ticketAddonLabel, { selected: true })
    await assertLiveTotal(page, '28.000')
    await toggleTicketAddon(page, fixture.ticketAddonLabel, { selected: false })
    await assertLiveTotal(page, '20.000')

    await page.getByRole('button', { name: /volver al evento/i }).click()
    await expect(page.locator('.tickets-page__hero')).toHaveCount(0)
  })

  test('adjunta un comprobante JPG y rechaza uno que pesa de más', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Bruno Comprobante', dni: '42222333', type: 'Público general' }],
    })
    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
    await assertTransferPanelVisible(page)

    await chooseTicketProofFile(page, {
      name: 'pesado.jpg',
      mimeType: 'image/jpeg',
      buffer: OVERSIZED_JPEG,
    })
    await submitTicketProof(page)
    await expect(page.locator('.ticket-purchase__submit-error')).toContainText(/2\s*MB/i)

    await chooseTicketProofFile(page, {
      name: 'transferencia.jpg',
      mimeType: 'image/jpeg',
      buffer: MINIMAL_JPEG,
    })
    await submitTicketProof(page)
    await expect(page.locator('.ticket-purchase__proof-success')).toContainText(
      /comprobante enviado/i,
      { timeout: 20_000 },
    )
    await expect(page.locator('.ticket-purchase__proof-upload')).toHaveCount(0)
  })
})
