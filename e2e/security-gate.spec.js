import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'
import {
  openSecurityGate,
  loginSecurityGate,
  assertGateZone,
  scanCredential,
  assertScanResult,
  markGateEntry,
  openScanTab,
  assertAllowlistPerson,
  ticketCredentialScanValue,
} from './security-gate-helpers.js'

let fixture
let admin

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

async function buyTicket({ fullName, dni, ticketTypeId, key, paid = true }) {
  const idempotencyKey = key ?? `e2e-gate-${randomUUID()}`
  const { data, error } = await admin.rpc('create_ticket_order_v2', {
    p_event_slug: fixture.ticketEventSlug,
    p_attendees: [{ fullName, dni, ticketTypeId }],
    p_buyer: { name: fullName, email: `${dni}@e2e.test`, provider: 'mercado_pago' },
    p_idempotency_key: idempotencyKey,
    p_access_token_hash: createHash('sha256').update(idempotencyKey).digest('hex'),
  })
  if (error) throw new Error(error.message)

  if (paid) {
    const { error: payError } = await admin
      .from('tickets')
      .update({ status: 'pagada' })
      .eq('event_id', fixture.ticketEventId)
      .eq('attendee_dni', dni)
    if (payError) throw new Error(payError.message)
  }

  const { data: credentials, error: readError } = await admin
    .from('tickets')
    .select('qr_token, credential_label, ticket_type_id, attendee_name, status')
    .eq('event_id', fixture.ticketEventId)
    .eq('attendee_dni', dni)
    .order('is_primary_credential', { ascending: false })
  if (readError) throw new Error(readError.message)
  return { order: data, credentials }
}

function scanValue(qrToken) {
  return ticketCredentialScanValue(qrToken, fixture.ticketEventSlug)
}

test.describe('Puerta de seguridad — entradas', () => {
  test('una cuenta de otro evento no entra a esta puerta', async ({ page }) => {
    await openSecurityGate(page, fixture.pausedEventSlug)
    await page.locator('input[name="email"]').fill(fixture.gateEmail)
    await page.locator('input[name="password"]').fill(fixture.gatePassword)
    await page.getByRole('button', { name: /entrar a seguridad/i }).click()
    await expect(page.getByRole('alert')).toContainText(/email, contraseña o evento/i)
    await expect(page.locator('.checkin-app')).toHaveCount(0)
  })

  test('en la puerta se ve el puesto, el tipo de entrada y se registra el ingreso una sola vez', async ({
    page,
  }) => {
    const dni = '41111222'
    const { credentials } = await buyTicket({
      fullName: 'Mora General',
      dni,
      ticketTypeId: fixture.generalTypeId,
    })
    expect(credentials).toHaveLength(1)
    const [pass] = credentials

    await openSecurityGate(page, fixture.ticketEventSlug)
    await loginSecurityGate(page, {
      email: fixture.gateEmail,
      password: fixture.gatePassword,
      eventTitle: fixture.ticketEventTitle,
    })
    await assertGateZone(page, fixture.gateZoneName)

    await scanCredential(page, scanValue(pass.qr_token))
    await assertScanResult(page, {
      outcome: /habilitado para ingresar/i,
      name: 'Mora General',
      label: 'Entrada general',
    })

    await markGateEntry(page)
    await expect(page.getByRole('button', { name: /registrar ingreso/i })).toHaveCount(0)

    await scanCredential(page, scanValue(pass.qr_token))
    await assertScanResult(page, { outcome: /ya ingresó/i, label: 'Entrada general' })
    await expect(page.getByRole('button', { name: /registrar ingreso/i })).toHaveCount(0)

    await assertAllowlistPerson(page, { name: 'Mora General', label: /entrada general/i })
  })

  test('una entrada sin pagar no habilita el ingreso', async ({ page }) => {
    const { credentials } = await buyTicket({
      fullName: 'Leo Impago',
      dni: '41444555',
      ticketTypeId: fixture.generalTypeId,
      paid: false,
    })
    const [pass] = credentials

    await openSecurityGate(page, fixture.ticketEventSlug)
    await loginSecurityGate(page, {
      email: fixture.gateEmail,
      password: fixture.gatePassword,
    })

    await scanCredential(page, scanValue(pass.qr_token))
    await assertScanResult(page, {
      outcome: /no habilitado/i,
      name: 'Leo Impago',
      label: 'Entrada general',
    })
    await expect(page.getByRole('button', { name: /registrar ingreso/i })).toHaveCount(0)
  })

  test('VIP y entrenador se leen con su propia etiqueta, y el calentamiento rechaza al público', async ({
    page,
  }) => {
    const vip = await buyTicket({
      fullName: 'Iván VIP',
      dni: '41222333',
      ticketTypeId: fixture.vipTypeId,
    })
    const coach = await buyTicket({
      fullName: 'Nora Coach',
      dni: '41333444',
      ticketTypeId: fixture.coachTypeId,
    })
    const vipToken = vip.credentials[0].qr_token
    const spectator = coach.credentials.find((row) => row.credential_label === 'Espectador')
    const trainer = coach.credentials.find((row) => row.credential_label === 'ENTRENADOR')
    expect(spectator && trainer).toBeTruthy()

    await openSecurityGate(page, fixture.ticketEventSlug)
    await loginSecurityGate(page, {
      email: fixture.gateEmail,
      password: fixture.gatePassword,
    })
    await assertGateZone(page, 'Puerta principal')

    await scanCredential(page, scanValue(vipToken))
    await assertScanResult(page, { label: 'VIP', name: 'Iván VIP', outcome: /habilitado/i })
    await markGateEntry(page)

    await scanCredential(page, scanValue(spectator.qr_token))
    await assertScanResult(page, { label: 'Espectador', name: 'Nora Coach' })

    await assertAllowlistPerson(page, { name: 'Iván VIP', label: 'VIP' })
    await assertAllowlistPerson(page, { name: 'Nora Coach', label: 'Espectador' })
    await expect(page.locator('.checkin-app__list')).toContainText('ENTRENADOR')
    await openScanTab(page)

    await page.locator('.checkin-app__exit').click()
    await openSecurityGate(page, fixture.ticketEventSlug)
    await loginSecurityGate(page, {
      email: fixture.warmupEmail,
      password: fixture.gatePassword,
    })
    await assertGateZone(page, fixture.warmupZoneName)

    await scanCredential(page, scanValue(trainer.qr_token))
    await assertScanResult(page, { label: 'ENTRENADOR', outcome: /habilitado/i })

    await scanCredential(page, scanValue(spectator.qr_token))
    await assertScanResult(page, { label: 'Espectador', outcome: /habilitado/i })
    await page.getByRole('button', { name: /registrar ingreso/i }).click()
    await expect(page.locator('.admin-checkin-result')).toContainText(/no abre esta zona/i)
    await expect(page.getByRole('button', { name: /registrar ingreso/i })).toHaveCount(0)
  })
})
