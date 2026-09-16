import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './admin-helpers.js'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import {
  MINIMAL_JPEG,
  assertCredentialPage,
  assertPassesOnConfirmation,
  chooseTicketProofFile,
  navigateToTickets,
  openTicketCredential,
  purchaseTickets,
  submitTicketProof,
} from './ticket-purchase-helpers.js'

let fixture
let admin
let financeContext
let financePage

test.describe('Entradas: medios de pago y QR', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000, retries: 1 })

  test.beforeAll(async ({ browser }) => {
    fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
    const supabase = resolveLocalSupabase()
    admin = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    financeContext = await browser.newContext()
    financePage = await financeContext.newPage()
    await loginAsAdmin(financePage, {
      email: fixture.adminEmail,
      password: fixture.adminPassword,
    })
  })

  test.afterAll(async () => {
    await financeContext?.close()
  })

  async function purchaseRow(dni) {
    const { data: ticket, error: ticketError } = await admin
      .from('tickets')
      .select('id, order_id, qr_token, status')
      .eq('event_id', fixture.ticketEventId)
      .eq('attendee_dni', dni)
      .eq('is_primary_credential', true)
      .maybeSingle()
    if (ticketError) throw new Error(`No se pudo leer el QR comprado: ${ticketError.message}`)
    if (!ticket) return null

    const { data: order, error: orderError } = await admin
      .from('ticket_orders')
      .select('id, amount, currency, provider, manual_payment_channel, status')
      .eq('id', ticket.order_id)
      .maybeSingle()
    if (orderError) throw new Error(`No se pudo leer la orden comprada: ${orderError.message}`)
    return { ticket, order }
  }

  async function approveManualOrder(orderId) {
    const response = await financePage.evaluate(async (id) => {
      const result = await fetch(`/api/tickets/orders/${id}/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-PLU-Request': 'browser',
        },
        body: '{}',
      })
      return { status: result.status, body: await result.json().catch(() => null) }
    }, orderId)
    expect(response.status, JSON.stringify(response.body)).toBe(200)
  }

  async function assertQrBecomesValid(page, { dni, name, token, approve }) {
    await openTicketCredential(page, { qrToken: token, eventSlug: fixture.ticketEventSlug })
    await assertCredentialPage(page, {
      name,
      verdict: 'Revisar antes de ingresar',
      status: 'Pendiente de pago',
    })
    await expect(page.getByRole('button', { name: /marcar ingreso/i })).toHaveCount(0)

    await approve()
    await expect.poll(async () => (await purchaseRow(dni))?.ticket.status).toBe('pagada')

    await openTicketCredential(page, { qrToken: token, eventSlug: fixture.ticketEventSlug })
    await assertCredentialPage(page, {
      name,
      verdict: 'Credencial válida',
      status: 'Pagada',
    })
    await expect(page.getByRole('button', { name: /marcar ingreso/i })).toBeVisible()
  }

  test('Mercado Pago acredita y el QR queda válido', async ({ page }, testInfo) => {
    const dni = String(45111001 + testInfo.retry * 100)
    const name = 'Mercado Pago QR'
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      paymentMethod: 'mercado_pago',
      attendees: [{ fullName: name, dni, type: 'Público general' }],
    })
    const [token] = await assertPassesOnConfirmation(page, { labels: ['Público general'] })

    const paymentResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/payments/embedded/process') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /^Confirmar pago$/i }).click()
    expect((await paymentResponse).ok()).toBeTruthy()
    // Al aprobar, el checkout embebido se desmonta y la confirmación canónica
    // repinta el pase como pagado. El sello intermedio puede no llegar a un
    // frame visible, por eso la aserción estable es el estado de la orden.
    await expect(page.locator('.ticket-purchase--confirmation')).toContainText('Aprobado')

    await expect.poll(async () => purchaseRow(dni)).not.toBeNull()
    await expect.poll(async () => (await purchaseRow(dni))?.order.status).toBe('aprobado')
    await expect.poll(async () => (await purchaseRow(dni))?.ticket.status).toBe('pagada')

    await openTicketCredential(page, { qrToken: token, eventSlug: fixture.ticketEventSlug })
    await assertCredentialPage(page, {
      name,
      verdict: 'Credencial válida',
      status: 'Pagada',
    })
  })

  for (const payment of [
    {
      label: 'transferencia',
      method: 'transferencia',
      channel: 'bank_transfer',
      dni: '45111002',
      name: 'Transferencia QR',
      amount: 20000,
      currency: 'ARS',
      needsProof: true,
    },
    {
      label: 'efectivo',
      method: 'cash_pitbull',
      channel: 'cash_pitbull',
      dni: '45111003',
      name: 'Efectivo QR',
      amount: 20000,
      currency: 'ARS',
      needsProof: false,
    },
    {
      label: 'Wise',
      method: 'wise_transfer',
      channel: 'wise_transfer',
      dni: '45111004',
      name: 'Wise QR',
      amount: 25,
      currency: 'USD',
      needsProof: true,
    },
  ]) {
    test(`${payment.label} crea la orden correcta y el QR se habilita al acreditar`, async (
      { page },
      testInfo,
    ) => {
      const dni = String(Number(payment.dni) + testInfo.retry * 100)
      await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
      await purchaseTickets(page, {
        paymentMethod: payment.method,
        attendees: [{ fullName: payment.name, dni, type: 'Público general' }],
      })
      const [token] = await assertPassesOnConfirmation(page, { labels: ['Público general'] })
      const row = await purchaseRow(dni)
      expect(row?.order).toMatchObject({
        provider: 'manual',
        manual_payment_channel: payment.channel,
        amount: payment.amount,
        currency: payment.currency,
        status: 'pendiente',
      })
      expect(row?.ticket.qr_token).toBe(token)

      if (payment.needsProof) {
        await chooseTicketProofFile(page, {
          name: `${payment.channel}.jpg`,
          mimeType: 'image/jpeg',
          buffer: MINIMAL_JPEG,
        })
        await submitTicketProof(page)
        await expect(page.locator('.ticket-purchase__proof-success')).toContainText(
          /comprobante enviado/i,
          { timeout: 20_000 },
        )
      } else {
        await expect(page.locator('.ticket-purchase__proof-upload')).toHaveCount(0)
      }

      await assertQrBecomesValid(page, {
        dni,
        name: payment.name,
        token,
        approve: () => approveManualOrder(row.order.id),
      })
    })
  }
})
