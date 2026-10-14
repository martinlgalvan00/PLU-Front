import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './admin-helpers.js'
import { deleteEventsByIds } from './fixture-cleanup.js'
import { FIXTURE_PATH } from './global-setup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'
import { buildAdminEventPath } from '../src/lib/adminEventRoute.js'

/**
 * Ventas → Cobro de un evento: guardado del perfil de cobro.
 *
 * Regresión del "No se pudieron guardar los datos del evento: No se pudo crear
 * el perfil de cobro." El evento tenía un alias suelto sin perfil vinculado y
 * ya existía un perfil activo con el nombre automático `Transferencia ·
 * <título>`: el índice único de nombre hacía fallar el alta, y como el perfil se
 * crea antes de guardar el evento, tampoco se guardaba nada más (ni siquiera el
 * texto del efectivo que el operador acababa de cambiar).
 *
 * Se arma un evento propio con ese estado exacto para no tocar la fixture
 * compartida, y se limpia al terminar.
 */
const ALL_OPEN = {
  mercado_pago: true,
  bank_transfer: true,
  cash_pitbull: true,
  wise_transfer: true,
}

let admin
let run
let slug
let title
let eventId
let previousProfileId
let previousName

const CASH_PLACE = 'Virtus fitness - Calle 105 Nro. 379 - Berazategui'
const CASH_NOTES = 'La inscripción queda sujeta a la fecha de pago.'

test.describe('Panel de eventos: perfil de cobro', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })

  // Una sola sesión de admin para los cuatro tests: el login de staff tiene tope
  // de 20 intentos por 15 min por IP y la suite completa ya consume casi todos.
  let context
  let page
  let fixture

  test.beforeAll(async ({ browser }, testInfo) => {
    fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
    const supabase = resolveLocalSupabase()
    admin = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    page = await context.newPage()
    await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })

    run = randomUUID().slice(0, 8)
    slug = `e2e-cobro-${run}`
    title = `E2E Cobro ${run}`
    previousName = `Transferencia · ${title}`

    // El perfil que el evento "ya creó" en un guardado anterior, con otro alias.
    const { data: previous, error: previousError } = await admin
      .from('payment_profiles')
      .insert({
        organization_id: ORG_ID,
        name: previousName,
        kind: 'bank_transfer',
        config: { alias: 'cobro.previo', cbu: '0000003100099999999999', holder: 'Titular Previo' },
        active: true,
      })
      .select('id')
      .single()
    if (previousError)
      throw new Error(`No se pudo crear el perfil previo: ${previousError.message}`)
    previousProfileId = previous.id

    const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const endsAt = new Date(Date.now() + 31 * 86_400_000).toISOString()
    const { data: event, error: eventError } = await admin
      .from('events')
      .insert({
        organization_id: ORG_ID,
        slug,
        title,
        venue: 'QA Gym',
        location: 'CABA',
        price: 75000,
        currency: 'ARS',
        status: 'proximamente',
        published: false,
        starts_at: startsAt,
        ends_at: endsAt,
        // Sin venta de entradas: el cobro de la inscripción no necesita jornadas
        // ni tipos de entrada, y el editor los exigiría para guardar.
        rules: { ticketsEnabled: false },
        payment_channel_overrides: { registration: ALL_OPEN, ticket: ALL_OPEN },
        // Alias suelto SIN perfil vinculado: lo que obliga a crear uno al guardar.
        bank_transfer_alias: 'cobro.uno',
        bank_transfer_cbu: '0000003100011111111111',
        bank_transfer_holder: 'Titular Uno',
        bank_transfer_profile_id: null,
      })
      .select('id')
      .single()
    if (eventError) throw new Error(`No se pudo crear el evento de cobro: ${eventError.message}`)
    eventId = event.id
  })

  test.afterAll(async () => {
    await context?.close()
    if (!admin) return
    if (eventId) await deleteEventsByIds(admin, [eventId])
    await admin
      .from('payment_profiles')
      .delete()
      .eq('organization_id', ORG_ID)
      .ilike('name', `%${title}%`)
    await admin
      .from('payment_profiles')
      .delete()
      .eq('id', previousProfileId ?? null)
  })

  async function storedEvent() {
    const { data, error } = await admin
      .from('events')
      .select(
        'bank_transfer_alias, bank_transfer_cbu, bank_transfer_holder, bank_transfer_profile_id, cash_payment_place, cash_payment_notes',
      )
      .eq('slug', slug)
      .single()
    if (error) throw new Error(`No se pudo releer ${slug}: ${error.message}`)
    return data
  }

  async function ownProfiles() {
    const { data, error } = await admin
      .from('payment_profiles')
      .select('id, name, active, config')
      .eq('organization_id', ORG_ID)
      .eq('kind', 'bank_transfer')
      .ilike('name', `%${title}%`)
      .order('created_at')
    if (error) throw new Error(`No se pudieron leer los perfiles: ${error.message}`)
    return data ?? []
  }

  async function openCobro(page) {
    await page.goto(buildAdminEventPath(slug))
    await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('tab', { name: /ventas y cupos/i }).click()
    await page.getByRole('tab', { name: /^Cobro$/i }).click()
    await expect(page.locator('#event-bank-alias')).toBeVisible()
  }

  const saveButton = (page) => page.getByRole('button', { name: /^Guardar( cambios)?$/i }).first()

  async function saveEvent(page) {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/events/upsert') && candidate.request().method() === 'POST',
    )
    // "Guardar" en el ancho de escritorio, "Guardar cambios" en otros layouts.
    await saveButton(page).click()
    const result = await response
    expect(result.ok(), await result.text()).toBeTruthy()
    await expect(saveButton(page)).toBeDisabled({ timeout: 20_000 })
    // El aviso de la captura no puede aparecer en un guardado que salió bien.
    await expect(page.getByText(/No se pudo crear el perfil de cobro/i)).toHaveCount(0)
    await expect(page.getByText(/No se pudieron guardar los datos del evento/i)).toHaveCount(0)
  }

  test('guardar con un alias suelto cuando ya existe un perfil con el nombre automático', async () => {
    await openCobro(page)

    // Punto de partida de la captura: alias cargado, sin perfil elegido.
    await expect(page.locator('#event-bank-alias')).toHaveValue('cobro.uno')
    await expect(page.locator('#event-bank-profile')).toHaveValue('')

    await page.locator('#event-cash-place').fill(CASH_PLACE)
    await page.locator('#event-cash-notes').fill(CASH_NOTES)
    // Lo que ve quien paga se arma con lo tipeado, antes de guardar.
    await expect(page.getByText(CASH_PLACE).last()).toBeVisible()
    await saveEvent(page)

    const stored = await storedEvent()
    expect(stored.cash_payment_place).toBe(CASH_PLACE)
    expect(stored.cash_payment_notes).toBe(CASH_NOTES)
    expect(stored.bank_transfer_alias).toBe('cobro.uno')
    expect(stored.bank_transfer_profile_id).toBeTruthy()
    expect(stored.bank_transfer_profile_id).not.toBe(previousProfileId)

    // Se creó un perfil nuevo con nombre propio y el previo quedó intacto.
    const profiles = await ownProfiles()
    expect(profiles).toHaveLength(2)
    const created = profiles.find((profile) => profile.id === stored.bank_transfer_profile_id)
    expect(created.config.alias).toBe('cobro.uno')
    expect(created.name).not.toBe(previousName)
    expect(created.name).toContain(title)
    const previous = profiles.find((profile) => profile.id === previousProfileId)
    expect(previous).toMatchObject({ active: true, name: previousName })
    expect(previous.config.alias).toBe('cobro.previo')

    // Recargado, el editor muestra lo guardado y el perfil quedó vinculado.
    await openCobro(page)
    await expect(page.locator('#event-cash-place')).toHaveValue(CASH_PLACE)
    await expect(page.locator('#event-cash-notes')).toHaveValue(CASH_NOTES)
    await expect(page.locator('#event-bank-profile')).toHaveValue(stored.bank_transfer_profile_id)
  })

  test('cambiar el alias varias veces guarda cada vez sin chocar por el nombre', async () => {
    await openCobro(page)

    for (const alias of ['cobro.dos', 'cobro.tres']) {
      await page.locator('#event-bank-alias').fill(alias)
      await saveEvent(page)
      const stored = await storedEvent()
      expect(stored.bank_transfer_alias).toBe(alias)
      expect(stored.bank_transfer_profile_id).toBeTruthy()
      const profile = (await ownProfiles()).find(
        (item) => item.id === stored.bank_transfer_profile_id,
      )
      expect(profile.config.alias).toBe(alias)
    }

    // Cada alias distinto es una cuenta distinta, con nombre distinto.
    const names = (await ownProfiles()).map((profile) => profile.name.trim().toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(4)

    // El mismo alias otra vez reusa el perfil: el catálogo no crece.
    await openCobro(page)
    await expect(page.locator('#event-bank-alias')).toHaveValue('cobro.tres')
    await page.locator('#event-bank-alias').fill('COBRO.TRES')
    await page.locator('#event-cash-notes').fill(`${CASH_NOTES} Actualizado.`)
    await saveEvent(page)
    expect(await ownProfiles()).toHaveLength(4)
    expect((await storedEvent()).cash_payment_notes).toBe(`${CASH_NOTES} Actualizado.`)
  })

  test('elegir un perfil del catálogo vincula el evento y sincroniza los datos', async () => {
    await openCobro(page)

    await page.locator('#event-bank-profile').selectOption(previousProfileId)
    await expect(page.locator('#event-bank-alias')).toHaveValue('cobro.previo')
    await saveEvent(page)

    const stored = await storedEvent()
    expect(stored.bank_transfer_profile_id).toBe(previousProfileId)
    expect(stored).toMatchObject({
      bank_transfer_alias: 'cobro.previo',
      bank_transfer_cbu: '0000003100099999999999',
      bank_transfer_holder: 'Titular Previo',
    })
    // Elegir uno existente no crea nada.
    expect(await ownProfiles()).toHaveLength(4)

    await openCobro(page)
    await expect(page.locator('#event-bank-profile')).toHaveValue(previousProfileId)
  })

  test('lo guardado es lo que ve quien compra: alias, titular y dónde se paga el efectivo', async ({
    request,
  }) => {
    // El endpoint público sólo responde por eventos publicados.
    const { error: publishError } = await admin
      .from('events')
      .update({ published: true })
      .eq('id', eventId)
    expect(publishError).toBeNull()

    const response = await request.get(`/api/tickets/availability/${slug}`)
    expect(response.ok(), await response.text()).toBeTruthy()
    const { checkout } = await response.json()

    expect(checkout.bankTransferProfileId).toBe(previousProfileId)
    expect(checkout.bankTransfer).toMatchObject({
      alias: 'cobro.previo',
      cbu: '0000003100099999999999',
      holder: 'Titular Previo',
    })
    expect(checkout.cashPayment).toMatchObject({
      place: CASH_PLACE,
      notes: `${CASH_NOTES} Actualizado.`,
    })
    expect(checkout.channels).toMatchObject({ bank_transfer: true, cash_pitbull: true })
  })
})
