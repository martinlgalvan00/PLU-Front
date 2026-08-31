import { expect } from '@playwright/test'

/**
 * Tipea y canjea un código, y cierra el anuncio del canje si el resolvedor lo
 * abre. El campo puede estar colapsado detrás de "Tengo un código" o ya
 * abierto (p. ej. justo después de "Quitar", que no vuelve a colapsarlo):
 * se espera a que aparezca CUALQUIERA de los dos antes de decidir, para no
 * decidir en base a un `isVisible()` instantáneo que puede llegar antes de
 * que React termine de pintar el toggle.
 *
 * Vive acá y no dentro de un spec porque lo usan dos escenarios distintos
 * (cupón con pasarela habilitada y cupón que sólo se paga a mano) y el punto
 * de sincronía —esperar la banda aplicada— es justo lo que hace que el resto
 * del test no arranque temprano.
 */
export async function redeemCode(page, code) {
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

/** Consentimiento de cookies, como lo resolvería cualquier visita real. */
export async function acceptCookies(page) {
  const cookieAcceptAll = page.getByRole('button', { name: /^Aceptar todo$/i })
  await cookieAcceptAll
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => cookieAcceptAll.click())
    .catch(() => {})
}
