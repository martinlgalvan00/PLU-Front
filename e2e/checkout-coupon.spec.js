import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH, FIXTURE_PATH } from './global-setup.js'

/**
 * El flujo entero como lo vive un atleta que ya canjeó un cupón y quiere
 * explorar otro medio de pago sin perderlo — el reporte que motivó este
 * archivo: "elegí un método de pago ingresando un cupón, pero si quiero
 * elegir otro método de pago me aparecen los valores fijos" (RegisterPage.jsx,
 * pantalla `changingMethod`, antes sin la sección del cupón).
 *
 * Corre con navegador de verdad, servidor de verdad y Supabase local de
 * verdad — es la prueba de que la regresión no vuelve, más allá de lo que ya
 * cubre `tests/registerCompetitionCheckout.render.test.jsx` en jsdom.
 */

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

test.use({ storageState: AUTH_STATE_PATH })

/**
 * Tipea y canjea un código, y cierra el anuncio del canje si el resolvedor lo
 * abre. El campo puede estar colapsado detrás de "Tengo un código" o ya
 * abierto (p. ej. justo después de "Quitar", que no vuelve a colapsarlo):
 * se espera a que aparezca CUALQUIERA de los dos antes de decidir, para no
 * decidir en base a un `isVisible()` instantáneo que puede llegar antes de
 * que React termine de pintar el toggle.
 */
async function redeemCode(page, code) {
  const toggle = page.getByRole('button', { name: /^Tengo un código$/i })
  const field = page.getByLabel(/^Código$/i)
  await Promise.race([toggle.waitFor({ state: 'visible' }), field.waitFor({ state: 'visible' })])
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click()
  }
  await field.fill(code)
  await page.getByRole('button', { name: /^Canjear$/i }).click()

  // El resolvedor real (no mockeado, a diferencia del render test en jsdom)
  // setea el preview y, si reconoce el código, el anuncio del canje en el
  // mismo tramo async — esperar la banda aplicada es el punto de sincronía
  // para que el chequeo del diálogo ya no llegue temprano.
  await expect(page.locator('.register-discount__applied')).toContainText(code, {
    timeout: 15_000,
  })

  const revealDialog = page.getByRole('dialog', { name: /precio promocional|descuento/i })
  if (await revealDialog.isVisible().catch(() => false)) {
    await revealDialog.getByRole('button', { name: /Seguir con el pago/i }).click()
    await expect(revealDialog).toBeHidden()
  }
}

test.describe('Inscripción a competencia — cupón + cambio de método de pago', () => {
  test('aplica el cupón, genera la orden por transferencia y lo conserva al cambiar de medio', async ({
    page,
  }) => {
    // 1) Como lo ve el atleta: Mi cuenta > Torneos > "Inscribirme" en el
    //    evento de QA. Primero, el consentimiento de cookies — como lo
    //    resolvería cualquier visita real antes de tocar cualquier otra cosa.
    await page.goto('/mi-cuenta?section=events')
    const cookieAcceptAll = page.getByRole('button', { name: /^Aceptar todo$/i })
    await cookieAcceptAll
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => cookieAcceptAll.click())
      .catch(() => {})

    const eventRow = page.locator('article.account-events-list__row', {
      hasText: fixture.eventTitle,
    })
    await eventRow.getByRole('button', { name: /Inscribirme/i }).click()

    // 2) Canjea el cupón de precio fijo ($75.000 → $50.000).
    await redeemCode(page, fixture.discountCode)

    const appliedBand = page.locator('.register-discount__applied')
    await expect(appliedBand).toContainText(fixture.discountCode)
    await expect(appliedBand).toContainText('50.000')

    // 3) Elige transferencia y genera la orden. Se clickea el <label> del
    //    pill, no el <input role=radio>: el pill lo envuelve entero y es lo
    //    que el navegador pinta encima en ese punto — clickear el input
    //    "a través" del label es justo lo que hace un mouse real.
    await page
      .locator('label.plu-checkout__pill', { hasText: 'Transferencia bancaria' })
      .click()
    await expect(page.getByRole('radio', { name: /Transferencia bancaria/i })).toBeChecked()
    await page.getByRole('button', { name: /Continuar al pago/i }).click()

    // El modal de transferencia se abre solo: hay que cerrarlo para llegar a
    // la pantalla de "cambiar método de pago" que queda debajo.
    const transferModal = page.getByRole('dialog', { name: /completar tu inscripción/i })
    await expect(transferModal).toBeVisible()
    await transferModal.getByRole('button', { name: /cerrar modal/i }).click()
    await expect(transferModal).toBeHidden()

    // 4) "Elegir otro medio" — la pantalla que perdía el cupón.
    await page.getByRole('button', { name: /^Elegir otro medio$/i }).click()

    await expect(page.getByRole('button', { name: /volver a transferencia/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /mercado pago/i })).toBeChecked()

    // El corazón del fix: el cupón sigue ahí, con su importe y con "Quitar"
    // — no un selector de medios en blanco con precios de catálogo.
    const changeMethodBand = page.locator('.register-discount__applied')
    await expect(changeMethodBand).toContainText(fixture.discountCode)
    await expect(changeMethodBand).toContainText('50.000')
    const removeButton = page.getByRole('button', { name: /^Quitar$/i })
    await expect(removeButton).toBeVisible()

    // 5) "Quitar" saca el cupón y deja el campo listo para cargar otro — la
    //    otra mitad del pedido: "que me aparezca otra vez todo el menú donde
    //    pueda poner nuevamente otro código".
    await removeButton.click()
    await expect(page.getByLabel(/^Código$/i)).toBeVisible()
    await expect(page.locator('.register-discount__applied')).toHaveCount(0)

    // 6) Se puede volver a canjear el mismo código desde esa misma pantalla,
    //    sin el "already_used" espurio que arreglamos en el backend.
    await redeemCode(page, fixture.discountCode)
    await expect(page.locator('.register-discount__applied')).toContainText(fixture.discountCode)
  })
})
