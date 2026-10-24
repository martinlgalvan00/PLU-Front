import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './admin-helpers.js'
import { deleteEventsByIds } from './fixture-cleanup.js'
import { FIXTURE_PATH } from './global-setup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'
import { seedOrganizer } from './staff-fixture.js'
import { buildAdminEventPath } from '../src/lib/adminEventRoute.js'

/**
 * Organizador: gestiona SOLO su evento.
 *
 * Una cuenta con rol Organizador y un evento asignado (A); existe otro (B) que no es suyo.
 * Se recorre lo que ve y puede hacer en el panel real, contra la API real (no dobles), y se
 * confirma que lo que el panel esconde también está cerrado del lado del servidor.
 */
let admin
let fixture
let run
let eventA
let eventB
let organizer
let athleteId
let orderA
let orderB
const created = { events: [], orders: [], registrations: [] }

async function insert(table, row, select = 'id') {
  const { data, error } = await admin.from(table).insert(row).select(select).single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}

// Ítems del menú lateral que un administrador ve y un organizador NO.
const ADMIN_ONLY_NAV = [
  'Resumen',
  'Personas',
  'Grilla',
  'Shop',
  'Cobros',
  'Libro de caja',
  'Tarifas',
  'Acceso y habilitación',
  'Usuarios',
  'Roles y permisos',
  'Auditoría',
  'Analítica',
]

const sidebarItem = (page, label) =>
  page
    .locator('.admin-shell .ant-menu-item')
    .filter({ has: page.getByText(label, { exact: true }) })

test.describe('Organizador: panel de su evento', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })

  let context
  let page

  test.beforeAll(async ({ browser }, testInfo) => {
    fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
    const supabase = resolveLocalSupabase()
    admin = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    run = randomUUID().slice(0, 8)

    const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const endsAt = new Date(Date.now() + 31 * 86_400_000).toISOString()
    const base = {
      organization_id: ORG_ID,
      venue: 'Sede QA',
      location: 'CABA',
      price: 50000,
      currency: 'ARS',
      status: 'proximamente',
      published: false,
      starts_at: startsAt,
      ends_at: endsAt,
      rules: { ticketsEnabled: false },
    }
    eventA = await insert(
      'events',
      { ...base, slug: `e2e-org-a-${run}`, title: `E2E Org A ${run}` },
      'id, slug, title',
    )
    eventB = await insert(
      'events',
      { ...base, slug: `e2e-org-b-${run}`, title: `E2E Org B ${run}` },
      'id, slug, title',
    )
    created.events.push(eventA.id, eventB.id)

    // Una inscripción con cobro pendiente en cada evento (efectivo: se acredita sin comprobante).
    const athlete = await insert('athletes', {
      full_name: `Atleta Org ${run}`,
      document_id: `8${Date.now() % 10_000_000}`,
      email: `atleta-org-${run}@pluarg.test`,
    })
    athleteId = athlete.id
    const makeOrder = (amount) =>
      insert('athlete_payment_orders', {
        organization_id: ORG_ID,
        athlete_id: athleteId,
        concept: 'registration',
        amount,
        method: 'manual_link',
        manual_payment_channel: 'cash_pitbull',
        status: 'validacion_manual',
      })
    orderA = await makeOrder(50000)
    orderB = await makeOrder(60000)
    created.orders.push(orderA.id, orderB.id)
    for (const [event, order] of [
      [eventA, orderA],
      [eventB, orderB],
    ]) {
      const registration = await insert('event_registrations', {
        athlete_id: athleteId,
        event_id: event.id,
        division: 'Open',
        category: 'Open',
        payment_order_id: order.id,
      })
      created.registrations.push(registration.id)
    }

    organizer = await seedOrganizer({
      run,
      events: [{ eventId: eventA.id, eventSlug: eventA.slug }],
    })

    // Una sola sesión para todo el recorrido: el login de staff tiene tope por IP.
    context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    page = await context.newPage()
    await loginAsAdmin(page, {
      email: organizer.organizerEmail,
      password: organizer.organizerPassword,
    })
  })

  test.afterAll(async () => {
    await context?.close()
    if (!admin) return
    await admin.from('event_registrations').delete().in('id', created.registrations)
    await admin.from('athlete_payment_orders').delete().in('id', created.orders)
    if (athleteId) await admin.from('athletes').delete().eq('id', athleteId)
    await deleteEventsByIds(admin, created.events)
  })

  test('entra directo a Eventos y no ve el resto del panel', async () => {
    await expect(page.getByRole('heading', { name: /eventos/i }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(sidebarItem(page, 'Eventos')).toBeVisible()
    // Ítems reales del menú de un administrador (tests/_control: los mismos selectores los
    // encuentran todos con una cuenta de administrador, así que "no está" no es un falso verde).
    for (const label of ADMIN_ONLY_NAV) {
      await expect(sidebarItem(page, label), label).toHaveCount(0)
    }
    // Sin el error de "no se pudieron cargar" que daban los listados globales.
    await expect(page.getByText(/no se pudieron cargar/i)).toHaveCount(0)
  })

  test('ve solo el evento que se le asignó y no puede crear ni publicar', async () => {
    await expect(page.getByTitle(new RegExp(eventA.slug))).toBeVisible()
    await expect(page.getByTitle(new RegExp(eventB.slug))).toHaveCount(0)
    await expect(page.getByRole('button', { name: /nuevo evento/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^seleccionar/i })).toHaveCount(0)
    await expect(page.getByText(/pronto habrá novedades/i)).toHaveCount(0)
  })

  test('el evento de otro no se abre ni siquiera con la URL directa', async () => {
    await page.goto(buildAdminEventPath(eventB.slug))
    await expect(page.getByTitle(new RegExp(eventA.slug))).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('region', { name: /evento seleccionado/i })).toHaveCount(0)
  })

  test('edita los datos de su evento y no puede publicarlo', async () => {
    await page.goto(buildAdminEventPath(eventA.slug))
    const workspace = page.getByRole('region', { name: /evento seleccionado/i })
    await expect(workspace).toBeVisible({ timeout: 20_000 })

    // Sin barra de estado: ni Publicar ni Abrir inscripciones.
    await expect(
      page.getByRole('button', { name: /^publicar$|abrir inscripciones|ocultar del sitio/i }),
    ).toHaveCount(0)
    // Y sí ve las pestañas de gestión, incluido el equipo de puerta.
    for (const name of [/^evento$/i, /^venta$/i, /pagos/i, /zonas y seguridad/i]) {
      await expect(workspace.getByRole('tab', { name }).first()).toBeVisible()
    }

    const venue = page.locator('#event-venue')
    await venue.fill('Sede nueva del organizador')
    const response = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/events/upsert') && candidate.request().method() === 'POST',
    )
    await page
      .getByRole('button', { name: /^Guardar( cambios)?$/i })
      .first()
      .click()
    const result = await response
    expect(result.ok(), await result.text()).toBeTruthy()

    const { data } = await admin
      .from('events')
      .select('venue, published, status')
      .eq('id', eventA.id)
      .single()
    expect(data.venue).toBe('Sede nueva del organizador')
    // Lo que no es suyo no se movió.
    expect(data.published).toBe(false)
    expect(data.status).toBe('proximamente')
  })

  test('Cobro: no puede abrir un medio que PLU tiene cerrado, y la cuenta se elige de la lista', async () => {
    await page.goto(buildAdminEventPath(eventA.slug))
    const workspace = page.getByRole('region', { name: /evento seleccionado/i })
    await workspace
      .getByRole('tab', { name: /^Venta$/i })
      .first()
      .click()
    await page.getByRole('tab', { name: /^Cobro/i }).click()

    // En una base nueva la plataforma tiene cerrados los medios manuales de inscripción.
    const transfer = page.getByRole('checkbox', { name: 'Transferencia · Inscripción' })
    await expect(transfer).toBeVisible()
    await expect(transfer).not.toBeChecked()
    await expect(transfer).toBeDisabled()
    // No ve controles para crear o conectar cuentas.
    await expect(page.getByRole('button', { name: /conectar|crear perfil/i })).toHaveCount(0)
  })

  test('Pagos: ve los cobros de SU evento y acredita uno', async () => {
    await page.goto(buildAdminEventPath(eventA.slug))
    const workspace = page.getByRole('region', { name: /evento seleccionado/i })
    await workspace.getByRole('tab', { name: /pagos/i }).first().click()

    await expect(page.getByText(`Atleta Org ${run}`).first()).toBeVisible({ timeout: 20_000 })
    // El monto propio se ve (así "el ajeno no aparece" no es un falso verde).
    await expect(page.getByText(/50\.000/).first()).toBeVisible()
    // El cobro del otro evento (60.000) no aparece.
    await expect(page.getByText(/60\.000/)).toHaveCount(0)

    await page
      .getByRole('button', { name: /^validar$/i })
      .first()
      .click()
    const confirm = page
      .getByRole('dialog')
      .getByRole('button', { name: /aprobar|validar|acreditar|confirmar/i })
    const approved = page.waitForResponse(
      (candidate) =>
        candidate.url().includes(`/api/athletes/admin/payment-orders/${orderA.id}/approve`) &&
        candidate.request().method() === 'POST',
    )
    await confirm.last().click()
    const approveResult = await approved
    expect(approveResult.ok(), await approveResult.text()).toBeTruthy()

    await expect
      .poll(
        async () =>
          (await admin.from('athlete_payment_orders').select('status').eq('id', orderA.id).single())
            .data.status,
      )
      .toBe('aprobado')
    // El del otro evento sigue intacto.
    const other = await admin
      .from('athlete_payment_orders')
      .select('status')
      .eq('id', orderB.id)
      .single()
    expect(other.data.status).toBe('validacion_manual')
  })

  test('lo que el panel esconde también está cerrado en el servidor', async () => {
    const request = page.request
    const cases = [
      ['GET', `/api/events/${eventB.slug}/payments`, 'event_not_assigned'],
      ['POST', `/api/athletes/admin/payment-orders/${orderB.id}/approve`, 'event_not_assigned'],
      ['GET', `/api/auth/security-users?eventId=${eventB.id}`, 'event_not_assigned'],
      ['POST', `/api/events/${eventA.slug}/state`, 'event_scope_denied'],
      ['GET', '/api/athletes/admin', 'event_scope_denied'],
      ['GET', '/api/users', 'event_scope_denied'],
      ['GET', '/api/tickets/orders/pending-manual', 'event_scope_denied'],
    ]
    for (const [method, path, code] of cases) {
      const response = await request.fetch(path, {
        method,
        headers: { 'X-PLU-Request': 'browser', 'Content-Type': 'application/json' },
        data: method === 'GET' ? undefined : {},
      })
      const body = await response.json().catch(() => ({}))
      expect(response.status(), `${method} ${path}`).toBe(403)
      expect(body.code, `${method} ${path}`).toBe(code)
    }
    // La orden del otro evento no se tocó.
    const other = await admin
      .from('athlete_payment_orders')
      .select('status')
      .eq('id', orderB.id)
      .single()
    expect(other.data.status).toBe('validacion_manual')
  })

  test('un administrador le asigna otro evento y lo ve al instante, sin volver a iniciar sesión', async ({
    browser,
  }, testInfo) => {
    const adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const adminPage = await adminContext.newPage()
    try {
      await loginAsAdmin(adminPage, {
        email: fixture.adminEmail,
        password: fixture.adminPassword,
      })
      await sidebarItem(adminPage, 'Usuarios').click()

      // El organizador figura con su cantidad de eventos.
      const row = adminPage.getByRole('group', { name: /acciones para e2e organizador/i })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(adminPage.getByText('1 evento').first()).toBeVisible()

      await row.getByRole('button').click()
      await adminPage.getByRole('menuitem', { name: /eventos asignados/i }).click()
      const dialog = adminPage.getByRole('dialog', { name: /eventos de e2e organizador/i })
      await expect(dialog.getByRole('checkbox', { name: new RegExp(eventA.title) })).toBeChecked()
      await dialog.getByRole('checkbox', { name: new RegExp(eventB.title) }).check()

      const saved = adminPage.waitForResponse(
        (candidate) =>
          candidate.url().includes('/event-access') && candidate.request().method() === 'PUT',
      )
      await dialog.getByRole('button', { name: /guardar eventos/i }).click()
      expect((await saved).ok()).toBeTruthy()
      await expect(adminPage.getByText('2 eventos').first()).toBeVisible()

      // El organizador, con la MISMA sesión, ahora abre el evento B por su URL directa (antes
      // de la asignación esa misma URL no abría nada).
      const workspaceB = page.getByRole('region', { name: /evento seleccionado/i })
      await page.goto(buildAdminEventPath(eventB.slug))
      await expect(workspaceB).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('#event-title')).toHaveValue(eventB.title)

      // Y se le puede quitar: la URL vuelve a no abrir nada y queda solo el suyo.
      await adminPage
        .getByRole('group', { name: /acciones para e2e organizador/i })
        .getByRole('button')
        .click()
      await adminPage.getByRole('menuitem', { name: /eventos asignados/i }).click()
      const again = adminPage.getByRole('dialog', { name: /eventos de e2e organizador/i })
      await again.getByRole('checkbox', { name: new RegExp(eventB.title) }).uncheck()
      await again.getByRole('button', { name: /guardar eventos/i }).click()
      await expect(adminPage.getByText('1 evento').first()).toBeVisible()
      await page.goto(buildAdminEventPath(eventB.slug))
      await expect(page.getByTitle(new RegExp(eventA.slug))).toBeVisible({ timeout: 20_000 })
      await expect(workspaceB).toHaveCount(0)
    } finally {
      await adminContext.close()
    }
  })
})
