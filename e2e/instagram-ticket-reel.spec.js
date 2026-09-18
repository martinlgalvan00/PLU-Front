import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { navigateToTickets, selectPaymentMethod, selectTicketType } from './ticket-purchase-helpers.js'

/**
 * instagram-ticket-reel.spec.js — PLU ARG
 *
 * No es un test de regresión: es una grabación deliberada, en cámara lenta,
 * de la compra de una entrada VIP de punta a punta — para subir a Instagram.
 * Corre contra la stack local de Docker (Supabase local + PAYMENTS_MOCK),
 * nunca contra el proyecto real. El video queda dentro de e2e/.test-results,
 * en la carpeta de esta corrida, como video.webm.
 */

test.use({
  viewport: { width: 1080, height: 1920 },
  video: { mode: 'on', size: { width: 1080, height: 1920 } },
})

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

/** Barrido de mouse sobre un elemento, para que el tilt 3D se vea en cámara. */
async function sweepTilt(page, locator, { steps = [0.2, 0.8, 0.35, 0.65], pauseMs = 550 } = {}) {
  const box = await locator.boundingBox()
  if (!box) return
  for (const fraction of steps) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height * 0.4, { steps: 14 })
    await page.waitForTimeout(pauseMs)
  }
}

test('reel: comprar una entrada VIP y ver el pase reluciente', async ({ page }) => {
  test.slow()

  // ── 1. "Así se ve tu entrada": el pase teaser en 3D ──
  await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
  const showcaseStage = page.locator('.tickets-page__pass-stage .ticket-pass-preview__stage')
  await showcaseStage.scrollIntoViewIfNeeded()
  await sweepTilt(page, showcaseStage)

  // ── 2. Vidriera de tipos: lift al pasar por la card VIP ──
  const offersGrid = page.locator('.tickets-page__offers-grid')
  await offersGrid.scrollIntoViewIfNeeded()
  const vipOffer = offersGrid.locator('.ticket-type-options__option', { hasText: 'VIP' })
  await vipOffer.hover()
  await page.waitForTimeout(1400)

  // ── 3. Checkout: elegir VIP y completar el formulario a ritmo humano ──
  await page.locator('#checkout').scrollIntoViewIfNeeded()
  await selectTicketType(page, 0, 'VIP')

  const nameInput = page.locator('#checkout input[name="attendee-0-fullName"]')
  await nameInput.click()
  await nameInput.pressSequentially('Camila Rearte', { delay: 55 })

  const dniInput = page.locator('#checkout input[name="attendee-0-dni"]')
  await dniInput.click()
  await dniInput.pressSequentially('30111222', { delay: 65 })

  const buyerName = page.locator('#checkout input[name="buyer-name"]')
  await buyerName.click()
  await buyerName.pressSequentially('Camila Rearte', { delay: 45 })

  const buyerEmail = page.locator('#checkout input[name="buyer-email"]')
  await buyerEmail.click()
  await buyerEmail.pressSequentially('camila.reel@pluarg.test', { delay: 35 })

  await selectPaymentMethod(page, 'mercado_pago')
  await page.waitForTimeout(600)

  const submit = page.locator('#checkout form.ticket-purchase .ticket-purchase__submit')
  await submit.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await submit.click()

  // ── 4. Mercado Pago (mock): aprobar el pago en cámara ──
  // La confirmación real llega tan rápido (evento plu:payment-updated) que el
  // resultado intermedio del brick embebido nunca alcanza a quedar en cámara:
  // el checkout entero se desmonta apenas la orden pasa a "aprobado". Se
  // espera directo la pantalla final, no ese estado transitorio.
  await expect(page.locator('.mp-embedded-checkout')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(900)
  const paymentResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/payments/embedded/process') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /^Confirmar pago$/i }).click()
  await paymentResponse

  // ── 5. Compra confirmada: sello + entrada lista, celeste, con QR real ──
  await expect(page.locator('.ticket-purchase--confirmation-editorial')).toContainText(
    /Compra confirmada/i,
    { timeout: 20_000 },
  )
  const passStage = page.locator('.ticket-purchase__pass-item .ticket-pass-preview__stage').first()
  await passStage.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await sweepTilt(page, passStage, { steps: [0.25, 0.75, 0.5], pauseMs: 700 })

  // ── 6. Descargar la entrada, en cámara ──
  const downloadButton = page.getByRole('button', { name: /^Descargar entrada$/i }).first()
  await downloadButton.scrollIntoViewIfNeeded()
  const downloadPromise = page.waitForEvent('download').catch(() => null)
  await downloadButton.click()
  await downloadPromise
  await page.waitForTimeout(1800)
})
