#!/usr/bin/env node
/**
 * E2E de Mercado Pago — el flujo entero como lo vive un atleta, más la
 * matriz de webhooks contra la API real.
 *
 * Qué recorre (con Playwright, browser de verdad):
 *   1. Afiliación: Mi cuenta > Afiliación > "Continuar con Mercado Pago" >
 *      checkout embebido (mock) > "Confirmar pago" > afiliación activa.
 *   2. Inscripción: Torneos > evento de QA > formulario competitivo >
 *      Mercado Pago > "Confirmar pago" > inscripción confirmada.
 *   3. Webhooks contra POST /api/payments/webhook/mercadopago:
 *      - firma HMAC válida con ts en SEGUNDOS (como lo manda MP) → 200
 *      - IPN `?topic=payment&id=…` sin firma → 200
 *      - IPN `merchant_order` → 200 con descarte confirmado (ignored)
 *      - firma falsa → 401 · ts vencido → 401 · sin identificadores → 400
 *
 * Prerrequisito: `supabase start` (instancia local). El script levanta la API
 * (PAYMENTS_MOCK=true) y el dev server de Vite, crea el atleta y el evento de
 * QA, corre todo y limpia lo que creó. No toca la base hosteada.
 *
 * Uso:  node scripts/e2e-mercado-pago.mjs
 * Salida: screenshots en scripts/.visual-check-output/e2e-mp/ y resumen en
 * consola. Exit code 1 si algo falla.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(__dirname, '.visual-check-output', 'e2e-mp')
mkdirSync(OUT_DIR, { recursive: true })

const API_PORT = Number(process.env.E2E_API_PORT ?? 3011)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5183)
const API_URL = `http://127.0.0.1:${API_PORT}`
const WEB_URL = `http://localhost:${WEB_PORT}`
const WEBHOOK_SECRET = 'e2e-webhook-secret'
const ORG_ID = '00000000-0000-4000-8000-000000000001'

const failures = []
const notes = []
function fail(message) {
  failures.push(message)
  console.error(`✗ ${message}`)
}
function ok(message) {
  notes.push(message)
  console.log(`✓ ${message}`)
}

// ---------------------------------------------------------------------------
// Supabase local
// ---------------------------------------------------------------------------
function resolveSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
  }
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const status = JSON.parse(raw.slice(raw.indexOf('{')))
  if (!status.API_URL || !status.SERVICE_ROLE_KEY) {
    throw new Error('Supabase local no está corriendo. Corré `supabase start` primero.')
  }
  return { url: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY }
}

const supabaseCreds = resolveSupabase()
const admin = createClient(supabaseCreds.url, supabaseCreds.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------------------
// Procesos: API + Vite
// ---------------------------------------------------------------------------
const children = []
function spawnProcess(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => {
    if (process.env.E2E_VERBOSE) process.stdout.write(`[${label}] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`))
  children.push(child)
  return child
}

async function waitForHttp(url, { timeoutMs = 90_000, label = url } = {}) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {
      // todavía no levantó
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${label} no respondió en ${timeoutMs / 1000}s`)
}

const serviceEnv = {
  PORT: String(API_PORT),
  PAYMENTS_MOCK: 'true',
  APP_PRODUCTION: 'false',
  APP_URL: WEB_URL,
  AUTH_SECRET: 'e2e-mercado-pago-secret',
  SUPABASE_URL: supabaseCreds.url,
  SUPABASE_SERVICE_ROLE_KEY: supabaseCreds.serviceRoleKey,
  MERCADO_PAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  // Sin credenciales reales: el server hace loadEnvFile() (que NO pisa lo ya
  // seteado), así que se vacían acá las integraciones que podrían salir a
  // internet durante el E2E. El proveedor de pagos ya es el mock.
  MERCADO_PAGO_ACCESS_TOKEN: '',
  BREVO_API_KEY: '',
  BREVO_SENDER_EMAIL: '',
}

// ---------------------------------------------------------------------------
// Fixture: atleta con sesión, plan vigente y evento con inscripción abierta
// ---------------------------------------------------------------------------
const RUN = randomUUID().slice(0, 8)
const fixture = {
  athleteId: null,
  eventId: null,
  eventSlug: `e2e-mp-${RUN}`,
  planId: null,
  planCreated: false,
}

async function ensurePlan() {
  const { data: existing } = await admin
    .from('membership_plans')
    .select('id, code, price')
    .eq('active', true)
    .eq('collection_mode', 'one_time')
    .lte('effective_from', new Date().toISOString())
    .or('retired_at.is.null,retired_at.gt.' + new Date().toISOString())
    .limit(1)
  if (existing?.length) {
    fixture.planId = existing[0].id
    return existing[0]
  }
  const { data, error } = await admin.rpc('staff_create_membership_plan_version', {
    p_plan: {
      familyCode: `e2e-mp-${RUN}`,
      name: 'E2E Afiliación anual',
      price: 85000,
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
    },
    p_actor: 'e2e:mercado-pago',
  })
  if (error) throw new Error(`No se pudo crear el plan de QA: ${error.message}`)
  fixture.planId = data.id
  fixture.planCreated = true
  return data
}

async function createEvent() {
  const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const endsAt = new Date(Date.now() + 31 * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('events')
    .insert({
      organization_id: ORG_ID,
      slug: fixture.eventSlug,
      title: `E2E Mercado Pago ${RUN}`,
      venue: 'QA Gym',
      location: 'CABA',
      price: 45000,
      currency: 'ARS',
      status: 'inscripcion_abierta',
      published: true,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear el evento de QA: ${error.message}`)
  fixture.eventId = data.id
}

async function createAthlete() {
  const { data, error } = await admin
    .from('athletes')
    .insert({
      organization_id: ORG_ID,
      full_name: `E2E MercadoPago ${RUN}`,
      document_id: String(90_000_000 + Math.floor(Math.random() * 9_999_999)),
      email: `e2e-mp-${RUN}@pluarg.test`,
      status: 'registrado',
      birth_date: '1994-05-18',
      sex: 'Masculino',
      gym: 'PLU Test Team',
      phone: '+5491100000000',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'CABA',
      division: 'Open',
      category: 'Raw',
      estimated_weight: 93,
      email_verified_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear el atleta de QA: ${error.message}`)
  fixture.athleteId = data.id
}

async function sessionCookie() {
  process.env.SUPABASE_URL = supabaseCreds.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseCreds.serviceRoleKey
  process.env.AUTH_SECRET = serviceEnv.AUTH_SECRET
  const { ATHLETE_SESSION_COOKIE_NAME, createAthleteSession } = await import(
    '../server/services/athleteSessionService.js'
  )
  const session = await createAthleteSession({
    client: admin,
    athleteId: fixture.athleteId,
    req: { get: () => undefined, ip: '127.0.0.1' },
  })
  return { name: ATHLETE_SESSION_COOKIE_NAME, value: session.token }
}

async function cleanup() {
  try {
    if (fixture.athleteId) {
      const { data: orders } = await admin
        .from('athlete_payment_orders')
        .select('id')
        .eq('athlete_id', fixture.athleteId)
      const orderIds = (orders ?? []).map((row) => row.id)
      if (orderIds.length) {
        await admin.from('embedded_payment_attempts').delete().in('order_id', orderIds)
      }
      // La bandeja del webhook es local: se limpian los eventos de pagos mock
      // para que la clave de idempotencia de una corrida no dedupee contra la
      // fila fallida de la anterior.
      await admin.from('payment_integration_events').delete().like('resource_id', 'mock_pay_%')
      await admin.from('payment_integration_events').delete().eq('resource_id', 'mock-payment-1')
      await admin.rpc('delete_athlete', {
        p_athlete_id: fixture.athleteId,
        p_actor: 'e2e:mercado-pago-cleanup',
      })
    }
    if (fixture.eventId) await admin.from('events').delete().eq('id', fixture.eventId)
    if (fixture.planCreated && fixture.planId) {
      await admin.from('membership_plans').delete().eq('id', fixture.planId)
    }
    await admin
      .from('domain_audit_logs')
      .delete()
      .or(`actor_id.eq.e2e:mercado-pago,actor_id.eq.${fixture.athleteId ?? 'x'}`)
  } catch (error) {
    console.warn(`Cleanup incompleto: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------
function signWebhook({ dataId, requestId, ts }) {
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

async function postWebhook({ query, headers = {}, body }) {
  const search = new URLSearchParams(query).toString()
  const response = await fetch(`${API_URL}/api/payments/webhook/mercadopago?${search}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? '{}' : JSON.stringify(body),
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    // algunos rechazos devuelven texto
  }
  return { status: response.status, payload }
}

async function expectWebhook(label, input, { status, match }) {
  const result = await postWebhook(input)
  if (result.status !== status) {
    fail(`${label}: esperaba HTTP ${status}, llegó ${result.status} (${JSON.stringify(result.payload)})`)
    return result
  }
  if (match && !match(result.payload)) {
    fail(`${label}: el body no cumple lo esperado (${JSON.stringify(result.payload)})`)
    return result
  }
  ok(label)
  return result
}

// ---------------------------------------------------------------------------
// Flujo de usuario
// ---------------------------------------------------------------------------
async function approveMockCheckout(page, shotPrefix) {
  // El checkout embebido en modo mock: chip "Mock · sin cobro" y el botón que
  // simula la aprobación como si el Brick hubiera cobrado.
  await page.getByText('Mock · sin cobro').first().waitFor({ timeout: 30_000 })
  await page.screenshot({ path: join(OUT_DIR, `${shotPrefix}-mock-checkout.png`), fullPage: true })
  await page.getByRole('button', { name: 'Confirmar pago' }).first().click()
}

async function fetchAthleteState(cookie) {
  const response = await fetch(`${API_URL}/api/athletes/session`, {
    headers: { Cookie: `${cookie.name}=${cookie.value}` },
  })
  if (!response.ok) throw new Error(`No se pudo leer la sesión del atleta: ${response.status}`)
  return response.json()
}

/** El snapshot viaja en snake_case; se lee tolerante para no atar el E2E. */
function paymentFields(payment) {
  return {
    status: String(payment.status ?? ''),
    concept: String(payment.concept ?? payment.conceptType ?? payment.concept_type ?? ''),
    externalPaymentId:
      payment.external_payment_id ??
      payment.externalPaymentId ??
      payment.attempts?.at?.(-1)?.external_payment_id ??
      null,
  }
}

async function waitForPayment(cookie, predicate, { label, timeoutMs = 45_000 }) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const state = await fetchAthleteState(cookie)
    const rows = state.paymentOrders ?? state.payments ?? []
    const payment = rows.find((row) => predicate(paymentFields(row)))
    if (payment) return { payment: paymentFields(payment), state }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`${label}: el pago esperado no apareció en ${timeoutMs / 1000}s`)
}

async function main() {
  console.log('— E2E Mercado Pago —')
  await ensurePlan()
  await createEvent()
  await createAthlete()
  const cookie = await sessionCookie()

  spawnProcess('api', 'node', ['server/index.js'], serviceEnv)
  await waitForHttp(`${API_URL}/health`, { label: 'API' })
  ok('API arriba (PAYMENTS_MOCK=true)')

  spawnProcess(
    'web',
    'npx',
    ['vite', '--port', String(WEB_PORT), '--strictPort'],
    { PORT: String(API_PORT), PAYMENTS_MOCK: 'true', APP_PRODUCTION: 'false' },
  )
  await waitForHttp(WEB_URL, { label: 'Vite' })
  ok('Web arriba')

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  await context.addCookies([
    { name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' },
  ])
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  let membershipPaymentId = null
  // ---- 1. Afiliación con Mercado Pago (mock) -------------------------------
  try {
    await page.goto(`${WEB_URL}/mi-cuenta?section=membership`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(OUT_DIR, 'membership-start.png'), fullPage: true })

    // Con plan anual y automático conviviendo, el switch puede arrancar en la
    // suscripción. Este E2E cubre el pago único con la pasarela embebida.
    const annualTab = page.getByRole('tab', { name: 'Anual' }).first()
    if (await annualTab.isVisible().catch(() => false)) {
      await annualTab.click()
    }

    const membershipCta = page.getByRole('button', { name: /Continuar con/i }).first()
    await membershipCta.waitFor({ timeout: 30_000 })
    await membershipCta.click()

    await approveMockCheckout(page, 'membership')
    const { payment } = await waitForPayment(
      cookie,
      (item) => item.concept !== 'registration' && item.status === 'aprobado',
      { label: 'afiliación' },
    )
    membershipPaymentId = payment.externalPaymentId ?? null
    ok(`Afiliación cobrada por la pasarela mock (pago ${membershipPaymentId ?? 's/id'})`)
    await page.screenshot({ path: join(OUT_DIR, 'membership-approved.png'), fullPage: true })

    const state = await fetchAthleteState(cookie)
    const activeMembership = (state.memberships ?? []).find((item) => item.status === 'activa')
    if (activeMembership) ok('La afiliación quedó activa')
    else fail('El pago se aprobó pero la afiliación no quedó activa')

    // Vigencia real de la fila: una 'activa' sin expiration_date se proyecta
    // como INACTIVA en el frontend (getMembershipLifecycle) y el atleta que
    // acaba de pagar seguiría viendo "Sin afiliación".
    const membershipQuery = await admin
      .from('memberships')
      .select('*')
      .eq('athlete_id', fixture.athleteId)
      .limit(1)
    if (membershipQuery.error) {
      fail(`No se pudo leer la fila de membresía: ${membershipQuery.error.message}`)
    }
    const membershipRow = membershipQuery.data?.[0] ?? null
    console.log(
      `   … fila de membresía: ${JSON.stringify(
        membershipRow && {
          status: membershipRow.status,
          start_date: membershipRow.start_date,
          expiration_date: membershipRow.expiration_date,
        },
      )}`,
    )
    if (!membershipRow?.expiration_date) {
      fail('La membresía acreditada quedó sin expiration_date: el frontend la muestra inactiva')
    }

    // Lo que ve el atleta al VOLVER: una carga fresca de Mi cuenta tiene que
    // mostrar la afiliación activa. Es la mitad visible de la acreditación.
    await page.goto(`${WEB_URL}/mi-cuenta?section=membership`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1_500)
    await page.screenshot({ path: join(OUT_DIR, 'membership-after-reload.png'), fullPage: true })
    const heroSaysUnaffiliated = await page
      .getByText('Sin afiliación', { exact: true })
      .first()
      .isVisible()
      .catch(() => false)
    if (heroSaysUnaffiliated) {
      const browserSession = await page.evaluate(async () => {
        const response = await fetch('/api/athletes/session')
        const data = await response.json()
        return {
          memberships: data.memberships ?? null,
          athleteStatus: data.athlete?.status ?? data.athletes?.[0]?.status ?? null,
        }
      })
      fail(
        `Con la afiliación pagada, la cuenta recargada sigue diciendo "Sin afiliación". Sesión vista por el navegador: ${JSON.stringify(browserSession)}`,
      )
    } else {
      ok('La cuenta recargada muestra la afiliación activa')
    }
  } catch (error) {
    await page.screenshot({ path: join(OUT_DIR, 'membership-FAILED.png'), fullPage: true })
    fail(`Afiliación: ${error.message}`)
  }

  // ---- 2. Inscripción con Mercado Pago (mock) ------------------------------
  let registrationPaymentId = null
  try {
    // Desde Mi cuenta > Torneos, como lo hace el atleta ya logueado: la fila
    // del evento tiene su "Inscribirme", que abre el checkout de competencia
    // con el perfil competitivo precargado.
    await page.goto(`${WEB_URL}/mi-cuenta?section=events`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(OUT_DIR, 'registration-start.png'), fullPage: true })

    const eventRow = page.locator('article.account-events-list__row', {
      hasText: `E2E Mercado Pago ${RUN}`,
    })
    await eventRow.waitFor({ timeout: 30_000 })
    await eventRow.getByRole('button', { name: /Inscribirme/i }).click()
    await page.waitForTimeout(2_000)
    console.log(`   … tras Inscribirme: ${page.url()}`)
    await page.screenshot({ path: join(OUT_DIR, 'registration-after-click.png'), fullPage: true })

    // El submit del checkout ('Pagar', o su variante por medio) crea la orden.
    const submit = page.locator('button.register-card__submit').first()
    await submit.waitFor({ timeout: 30_000 })
    await page.screenshot({ path: join(OUT_DIR, 'registration-checkout.png'), fullPage: true })
    await submit.click()

    await approveMockCheckout(page, 'registration')
    const { payment } = await waitForPayment(
      cookie,
      (item) => item.concept === 'registration' && item.status === 'aprobado',
      { label: 'inscripción' },
    )
    registrationPaymentId = payment.externalPaymentId ?? null
    ok(`Inscripción cobrada por la pasarela mock (pago ${registrationPaymentId ?? 's/id'})`)
    await page.screenshot({ path: join(OUT_DIR, 'registration-approved.png'), fullPage: true })
  } catch (error) {
    await page.screenshot({ path: join(OUT_DIR, 'registration-FAILED.png'), fullPage: true })
    fail(`Inscripción: ${error.message}`)
  }

  if (pageErrors.length) fail(`Errores de consola durante el flujo: ${pageErrors.join(' | ')}`)
  await browser.close()

  // ---- 3. Matriz de webhooks ------------------------------------------------
  // Contra un pago mock REAL de esta corrida: el webhook consulta el recurso
  // canónico, así que un id inventado termina en 404 del proveedor.
  const paymentId = registrationPaymentId ?? membershipPaymentId ?? 'mock-payment-1'
  const requestId = `e2e-${RUN}`
  const tsSeconds = Math.floor(Date.now() / 1000)

  await expectWebhook(
    'Webhook firmado con ts en SEGUNDOS (formato real de MP) → 200',
    {
      query: { type: 'payment', 'data.id': paymentId },
      headers: {
        'x-request-id': requestId,
        'x-signature': signWebhook({ dataId: paymentId, requestId, ts: tsSeconds }),
      },
      // El id de notificación es único por corrida: la bandeja dedupea por él,
      // y reusar un literal colisionaría con la fila de una corrida anterior.
      body: { id: `e2e-${RUN}-signed`, type: 'payment', data: { id: paymentId } },
    },
    { status: 200, match: (body) => body?.received === true },
  )

  await expectWebhook(
    'IPN sin firma (`?topic=payment&id=…`) → 200',
    { query: { topic: 'payment', id: paymentId }, body: {} },
    { status: 200, match: (body) => body?.received === true },
  )

  await expectWebhook(
    'IPN merchant_order → 200 con descarte confirmado',
    { query: { topic: 'merchant_order', id: '43954117155' }, body: {} },
    { status: 200, match: (body) => body?.received === true && body?.ignored === true },
  )

  await expectWebhook(
    'Firma falsa → 401 (no se acredita)',
    {
      query: { type: 'payment', 'data.id': paymentId },
      headers: {
        'x-request-id': requestId,
        'x-signature': `ts=${tsSeconds},v1=${'0'.repeat(64)}`,
      },
      body: { id: `e2e-${RUN}-forged`, type: 'payment', data: { id: paymentId } },
    },
    { status: 401 },
  )

  await expectWebhook(
    'Firma válida pero ts vencido (>300s) → 401',
    {
      query: { type: 'payment', 'data.id': paymentId },
      headers: {
        'x-request-id': requestId,
        'x-signature': signWebhook({ dataId: paymentId, requestId, ts: tsSeconds - 600 }),
      },
      body: { id: `e2e-${RUN}-stale`, type: 'payment', data: { id: paymentId } },
    },
    { status: 401 },
  )

  await expectWebhook(
    'Notificación sin data.id ni topic → 400',
    { query: {}, body: { id: `e2e-${RUN}-empty` } },
    { status: 400 },
  )

  // ---- Resumen ---------------------------------------------------------------
  console.log('\n—— Resumen ——')
  for (const note of notes) console.log(`  ✓ ${note}`)
  for (const failure of failures) console.log(`  ✗ ${failure}`)
  console.log(`Screenshots: ${OUT_DIR}`)
}

let exitCode = 0
try {
  await main()
  if (failures.length) exitCode = 1
} catch (error) {
  console.error(`E2E abortado: ${error.stack ?? error.message}`)
  exitCode = 1
} finally {
  await cleanup()
  for (const child of children) {
    try {
      if (process.platform === 'win32' && child.pid) {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        child.kill('SIGTERM')
      }
    } catch {
      // ya había muerto
    }
  }
}
process.exit(exitCode)
