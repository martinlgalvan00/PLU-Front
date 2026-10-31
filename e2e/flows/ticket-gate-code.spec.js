import { expect, test } from '@playwright/test'
import { acceptCookies, mockApi, openEvent } from './mock-api.js'

/**
 * La entrada paga, sin Docker: el código XXX-XXX se ve, se abre en la
 * plataforma, se descarga y se manda a imprimir. El canje en la puerta
 * (mismo ingreso que el QR, y el segundo día) está en
 * `e2e/ticket-gate-code.spec.js`, contra Supabase local.
 */

const SLUG = 'puerta-e2e-2026'
const GATE_CODE = 'K4M-7QP'
const QR_TOKEN = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function ticketEvent() {
  return {
    id: 'evt-puerta',
    slug: SLUG,
    title: 'Pitbull Puerta',
    venue: 'QA Gym',
    location: 'CABA',
    starts_at: '2027-06-12T15:00:00Z',
    ends_at: '2027-06-13T23:00:00Z',
    status: 'inscripcion_abierta',
    published: true,
    price: 20000,
    currency: 'ARS',
    rules: {
      ticketsEnabled: true,
      salesIntent: 'charge',
      landing: { templateId: 'meet', themeId: 'plu-default', publicVisible: true },
    },
    eventDays: [
      { id: 'day-1', day_index: 0, label: 'Día 1', date: '2027-06-12' },
      { id: 'day-2', day_index: 1, label: 'Día 2', date: '2027-06-13' },
    ],
    ticketTypes: [
      {
        id: 'type-general',
        name: 'Público general',
        price: 20000,
        sort_order: 1,
        active: true,
        access_usage_mode: 'once_per_event_day',
        ticketTypeDays: [{ event_day_id: 'day-1' }, { event_day_id: 'day-2' }],
        credentials: [
          {
            id: 'cred-1',
            label: 'Entrada general',
            zone_scopes: ['gate_tickets'],
            sort_order: 0,
          },
        ],
      },
    ],
  }
}

test('el comprador ve el código, lo abre, lo descarga y lo imprime', async ({ page }) => {
  const state = await mockApi(page, { events: [ticketEvent(), openEvent()] })

  await page.route('**/api/tickets/**', async (route) => {
    const request = route.request()
    const { pathname, searchParams } = new URL(request.url())
    if (request.method() === 'GET' && pathname === `/api/tickets/availability/${SLUG}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          availability: null,
          checkout: {
            ticketEnabled: true,
            channels: {
              mercado_pago: true,
              bank_transfer: true,
              cash_pitbull: false,
              wise_transfer: false,
            },
          },
        }),
      })
    }
    if (request.method() === 'GET' && pathname === '/api/tickets/orders/lookup') {
      expect(searchParams.get('reference')).toBe('TORD-puerta')
      expect(searchParams.get('email')).toBe('sol@e2e.test')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order: {
            reference: 'TORD-puerta',
            status: 'aprobado',
            eventTitle: 'Pitbull Puerta',
            eventSlug: SLUG,
          },
          tickets: [
            {
              id: 't1',
              order_id: 'order-1',
              ticket_code: 'TCK-00000042',
              qr_token: QR_TOKEN,
              gate_code: GATE_CODE,
              attendee_name: 'Sol Puerta',
              attendee_dni: '43111001',
              status: 'pagada',
              credential_label: 'Entrada general',
              credential_scopes: ['gate_tickets'],
              is_primary_credential: true,
              ticket_type_name: 'Público general',
            },
          ],
        }),
      })
    }
    state.unhandled.push(`${request.method()} ${pathname}`)
    return route.fallback()
  })

  await page.goto(`/evento/entradas?evento=${SLUG}`)
  await acceptCookies(page)
  await expect(page.locator('.tickets-page__hero')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: /ya compraste/i }).click()
  await page.getByLabel(/código de la compra/i).fill('TORD-puerta')
  await page.getByLabel(/mail con el que compraste/i).fill('sol@e2e.test')
  await page.getByRole('button', { name: /buscar mi entrada/i }).click()

  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })
  await expect(confirmation.locator('.ticket-purchase__gate-code-value')).toHaveText(GATE_CODE)
  await expect(confirmation).toContainText(/misma entrada/i)
  await expect(confirmation).toContainText('Sol Puerta')

  await confirmation.getByRole('button', { name: /ver mi entrada/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Sol Puerta')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  const downloadPromise = page.waitForEvent('download', { timeout: 25_000 })
  await confirmation.getByRole('button', { name: /descargar entrada/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/sol-puerta/i)
  expect(download.suggestedFilename()).toMatch(/png$/i)

  const printed = page.waitForEvent('popup', { timeout: 25_000 })
  await confirmation.getByRole('button', { name: /imprimir entrada/i }).click()
  const popup = await printed
  // En headless, `window.print()` dispara `afterprint` y la ventana se cierra.
  // Si queda abierta, el HTML tiene que ser el del pase.
  const outcome = await popup
    .waitForEvent('close', { timeout: 8_000 })
    .then(() => 'closed')
    .catch(() => 'open')
  if (outcome === 'open') {
    expect(await popup.content()).toContain('window.print()')
    await popup.close()
  } else {
    expect(outcome).toBe('closed')
  }
})
