import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH, FIXTURE_PATH } from './global-setup.js'
import { acceptCookies, redeemCode } from './redeem-code.js'

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

test.describe('Inscripción a competencia — cupón + cambio de método de pago', () => {
  test('aplica el cupón, genera la orden por transferencia y lo conserva al cambiar de medio', async ({
    page,
  }) => {
    // 1) Como lo ve el atleta: Mi cuenta > Torneos > "Inscribirme" en el
    //    evento de QA. Primero, el consentimiento de cookies — como lo
    //    resolvería cualquier visita real antes de tocar cualquier otra cosa.
    await page.goto('/mi-cuenta?section=events')
    await acceptCookies(page)

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
