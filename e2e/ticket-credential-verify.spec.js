import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import {
  navigateToTickets,
  purchaseTickets,
  assertOrderCreated,
  assertPassesOnConfirmation,
  openTicketCredential,
  assertCredentialPage,
} from './ticket-purchase-helpers.js'

let fixture
let admin

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

/**
 * Lo que ve quien escanea el QR después de comprar.
 *
 * La compra pasa por el formulario (mismo camino que el comprador). La
 * acreditación se hace por update directo — igual que `ticket-credentials.spec.js` —
 * porque Finanzas / MP quedan fuera de esta fase.
 */
test.describe('Verificación pública de credenciales de entrada', () => {
  test('el QR de un entrenador abre dos credenciales distintas, pendientes hasta acreditar', async ({
    page,
  }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Luz Entrenadora', dni: '40444555', type: 'Entrenadores' }],
    })

    await assertOrderCreated(page, { expectedAmount: '10.000', expectedQuantity: 2 })
    const tokens = await assertPassesOnConfirmation(page, {
      labels: ['Espectador', 'ENTRENADOR'],
    })
    expect(tokens).toHaveLength(2)

    const ticketCode = await page
      .locator('.ticket-purchase--confirmation .ticket-purchase__ticket-info')
      .first()
      .innerText()

    await openTicketCredential(page, { qrToken: tokens[0], eventSlug: fixture.ticketEventSlug })
    await assertCredentialPage(page, {
      name: 'Luz Entrenadora',
      verdict: 'Revisar antes de ingresar',
      status: 'Pendiente de pago',
    })
    await expect(page.locator('.credential-page')).toContainText(
      /todavía no tiene el pago acreditado/i,
    )
    await expect(page.getByRole('button', { name: /marcar ingreso/i })).toHaveCount(0)

    const { error: payError } = await admin
      .from('tickets')
      .update({ status: 'pagada' })
      .eq('attendee_dni', '40444555')
      .eq('event_id', fixture.ticketEventId)
    expect(payError).toBeNull()

    await openTicketCredential(page, { qrToken: tokens[0], eventSlug: fixture.ticketEventSlug })
    await assertCredentialPage(page, {
      name: 'Luz Entrenadora',
      verdict: 'Credencial válida',
      status: 'Pagada',
    })
    // App siempre pasa `onCheckIn`: el botón aparece con el pago acreditado.
    // El canje en sí exige sesión staff; acá sólo se afirma que la credencial
    // quedó válida y distinguible, sin ejecutar el check-in.
    await expect(page.getByRole('button', { name: /marcar ingreso/i })).toBeVisible()
    await expect(page.locator('.credential-page__schedule-day')).toHaveText(
      /^(Espectador|ENTRENADOR)$/,
    )
    await expect(ticketCode).toMatch(/TCK-\d{8}/)

    const firstLabel = (await page.locator('.credential-page__schedule-day').textContent())?.trim()
    await openTicketCredential(page, { qrToken: tokens[1], eventSlug: fixture.ticketEventSlug })
    await assertCredentialPage(page, {
      name: 'Luz Entrenadora',
      verdict: 'Credencial válida',
      status: 'Pagada',
    })
    const secondLabel = (await page.locator('.credential-page__schedule-day').textContent())?.trim()
    expect(new Set([firstLabel, secondLabel])).toEqual(new Set(['Espectador', 'ENTRENADOR']))

    if (secondLabel === 'ENTRENADOR') {
      await expect(page.locator('.credential-page__zones')).toContainText('Entrada en calor')
    } else {
      await expect(page.locator('.credential-page__zones')).toContainText('Puerta general')
    }
  })

  test('un token que no existe se lee como credencial no válida', async ({ page }) => {
    await openTicketCredential(page, {
      qrToken: '00000000-0000-4000-8000-000000000099',
      eventSlug: fixture.ticketEventSlug,
    })
    await assertCredentialPage(page, { verdict: 'Credencial no válida' })
    await expect(page.locator('.credential-page')).toContainText(/no está registrado/i)
  })
})
