import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { TICKET_GATE_CODE_ALPHABET, normalizeGateCode } from '../src/lib/ticketGateCode.js'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import {
  assertScanResult,
  loginSecurityGate,
  markGateEntry,
  openSecurityGate,
  scanCredential,
  ticketCredentialScanValue,
} from './security-gate-helpers.js'
import { navigateToTickets } from './ticket-purchase-helpers.js'

/**
 * El XXX-XXX y el QR son la misma entrada.
 *
 * Compra por la misma RPC que usa el sitio, la muestra en la pantalla del
 * comprador y la canjea en la puerta de verdad. Un segundo intento del mismo
 * día no entra. En un pase de dos jornadas, el ingreso de un día no quema el otro.
 */

let fixture
let admin

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

function argentinaDate(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())
  const [year, month, day] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10)
}

async function buyPaidTicket({ fullName, dni, ticketTypeId }) {
  const idempotencyKey = `e2e-gate-code-${randomUUID()}`
  const email = `${dni}@e2e.test`
  const { data, error } = await admin.rpc('create_ticket_order_v2', {
    p_event_slug: fixture.ticketEventSlug,
    p_attendees: [{ fullName, dni, ticketTypeId }],
    p_buyer: { name: fullName, email, provider: 'mercado_pago' },
    p_idempotency_key: idempotencyKey,
    p_access_token_hash: createHash('sha256').update(idempotencyKey).digest('hex'),
  })
  if (error) throw new Error(error.message)

  const orderId = data.order.id
  const paidOrder = await admin.from('ticket_orders').update({ status: 'aprobado' }).eq('id', orderId)
  if (paidOrder.error) throw new Error(paidOrder.error.message)
  const paidTickets = await admin.from('tickets').update({ status: 'pagada' }).eq('order_id', orderId)
  if (paidTickets.error) throw new Error(paidTickets.error.message)

  const { data: credentials, error: readError } = await admin
    .from('tickets')
    .select('id, qr_token, gate_code, ticket_code, event_id')
    .eq('order_id', orderId)
    .order('is_primary_credential', { ascending: false })
  if (readError) throw new Error(readError.message)

  return {
    reference: data.order.reference,
    email,
    credentials,
  }
}

function assertGateCode(code) {
  expect(normalizeGateCode(code), 'el código de puerta tiene que ser XXX-XXX').toBe(code)
  for (const char of code.replace('-', '')) {
    expect(TICKET_GATE_CODE_ALPHABET.includes(char)).toBe(true)
  }
}

async function recoverPaidPass(page, { reference, email, gateCode, name }) {
  await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
  await page.getByRole('button', { name: /ya compraste/i }).click()
  await page.getByLabel(/código de la compra/i).fill(reference)
  await page.getByLabel(/mail con el que compraste/i).fill(email)
  await page.getByRole('button', { name: /buscar mi entrada/i }).click()

  const confirmation = page.locator('.ticket-purchase--confirmation')
  await expect(confirmation).toBeVisible({ timeout: 15_000 })
  await expect(confirmation.locator('.ticket-purchase__gate-code-value')).toHaveText(gateCode)
  await expect(confirmation).toContainText(name)
  await expect(confirmation.getByRole('button', { name: /ver mi entrada/i })).toBeEnabled()
  await expect(confirmation.getByRole('button', { name: /descargar entrada/i })).toBeEnabled()
  await expect(confirmation.getByRole('button', { name: /imprimir entrada/i })).toBeEnabled()
}

test.describe('Código de puerta', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })

  test('el comprador ve el código y la puerta lo canjea igual que el QR', async ({ page }) => {
    const bought = await buyPaidTicket({
      fullName: 'Sol Puerta',
      dni: '43111001',
      ticketTypeId: fixture.generalTypeId,
    })
    const [pass] = bought.credentials
    expect(bought.credentials).toHaveLength(1)
    assertGateCode(pass.gate_code)

    await recoverPaidPass(page, {
      reference: bought.reference,
      email: bought.email,
      gateCode: pass.gate_code,
      name: 'Sol Puerta',
    })

    await page.getByRole('button', { name: /ver mi entrada/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Sol Puerta')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    const downloadPromise = page.waitForEvent('download', { timeout: 25_000 })
    await page.getByRole('button', { name: /descargar entrada/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/sol-puerta/i)
    expect(download.suggestedFilename()).toMatch(/png$/i)

    await openSecurityGate(page, fixture.ticketEventSlug)
    await loginSecurityGate(page, {
      email: fixture.gateEmail,
      password: fixture.gatePassword,
      eventTitle: fixture.ticketEventTitle,
    })

    const spoken = pass.gate_code.toLowerCase().replace('-', ' ')
    await scanCredential(page, spoken)
    await assertScanResult(page, {
      outcome: /habilitado para ingresar/i,
      name: 'Sol Puerta',
      label: 'Entrada general',
    })
    await markGateEntry(page)

    await scanCredential(page, ticketCredentialScanValue(pass.qr_token, fixture.ticketEventSlug))
    await assertScanResult(page, { outcome: /ya ingresó/i, name: 'Sol Puerta' })

    await scanCredential(page, pass.gate_code)
    await assertScanResult(page, { outcome: /ya ingresó/i, name: 'Sol Puerta' })
  })

  test('un pase de dos jornadas no quema el otro día', async ({ page }) => {
    const today = argentinaDate(0)
    const tomorrow = argentinaDate(1)
    const { data: eventRow, error: eventError } = await admin
      .from('events')
      .select('organization_id')
      .eq('id', fixture.ticketEventId)
      .single()
    if (eventError) throw new Error(eventError.message)

    const { data: type, error: typeError } = await admin
      .from('ticket_types')
      .insert({
        event_id: fixture.ticketEventId,
        name: 'Pase dos días E2E',
        price: 20000,
        manual_price: 20000,
        quota: 20,
        sort_order: 90,
        active: true,
        access_usage_mode: 'once_per_event_day',
      })
      .select('id')
      .single()
    if (typeError) throw new Error(typeError.message)

    const existingDay = await admin
      .from('event_days')
      .select('id')
      .eq('event_id', fixture.ticketEventId)
      .eq('day_index', 90)
      .maybeSingle()
    if (existingDay.error) throw new Error(existingDay.error.message)
    const tomorrowDay = existingDay.data
      ? (
          await admin
            .from('event_days')
            .update({ date: tomorrow, label: 'Jornada siguiente E2E' })
            .eq('id', existingDay.data.id)
            .select('id')
            .single()
        ).data
      : (
          await admin
            .from('event_days')
            .insert({
              event_id: fixture.ticketEventId,
              day_index: 90,
              label: 'Jornada siguiente E2E',
              date: tomorrow,
            })
            .select('id')
            .single()
        ).data
    if (!tomorrowDay?.id) throw new Error('No se pudo dejar la jornada de mañana.')

    const { data: todayDay, error: todayError } = await admin
      .from('event_days')
      .select('id')
      .eq('event_id', fixture.ticketEventId)
      .eq('date', today)
      .maybeSingle()
    if (todayError) throw new Error(todayError.message)
    if (!todayDay) throw new Error('La jornada de hoy del fixture no está.')

    const linked = await admin.from('ticket_type_days').insert([
      { ticket_type_id: type.id, event_day_id: todayDay.id },
      { ticket_type_id: type.id, event_day_id: tomorrowDay.id },
    ])
    if (linked.error) throw new Error(linked.error.message)

    const credentials = await admin.rpc('staff_merge_ticket_type_credentials', {
      p_event_slug: fixture.ticketEventSlug,
      p_credentials: [
        {
          ticketTypeId: type.id,
          credentials: [{ label: 'Pase dos días', zoneScopes: ['gate_tickets'] }],
        },
      ],
    })
    if (credentials.error) throw new Error(credentials.error.message)

    const bought = await buyPaidTicket({
      fullName: 'Día Dos',
      dni: '43111002',
      ticketTypeId: type.id,
    })
    const [pass] = bought.credentials
    assertGateCode(pass.gate_code)

    const otherDay = await admin.from('check_ins').insert({
      event_id: fixture.ticketEventId,
      organization_id: eventRow.organization_id,
      attendee_kind: 'spectator',
      ticket_id: pass.id,
      gate: 'Puerta',
      access_window_key: `event_day:${tomorrow}`,
    })
    if (otherDay.error) throw new Error(otherDay.error.message)

    await openSecurityGate(page, fixture.ticketEventSlug)
    await loginSecurityGate(page, {
      email: fixture.gateEmail,
      password: fixture.gatePassword,
    })

    await scanCredential(page, pass.gate_code.replace('-', ''))
    await assertScanResult(page, {
      outcome: /habilitado para ingresar/i,
      name: 'Día Dos',
      label: 'Pase dos días',
    })
    await markGateEntry(page)

    await scanCredential(page, pass.gate_code)
    await assertScanResult(page, { outcome: /ya ingresó/i, name: 'Día Dos' })

    const { count, error: countError } = await admin
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', pass.id)
    if (countError) throw new Error(countError.message)
    expect(count).toBe(2)
  })
})
