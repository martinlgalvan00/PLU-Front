/**
 * QA visual de las superficies de credencial (destino del QR).
 *
 * Intercepta las RPC de Supabase para renderizar los estados reales sin
 * depender de datos de producción.
 *
 * Uso: npm run dev:web  →  node tmp/credential-qa.mjs [--tag base]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.QA_URL ?? 'http://localhost:5175'
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) ?? '--tag=base').split('=')[1]
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\//, '')
mkdirSync(OUT, { recursive: true })

const SCHEDULE = {
  day_id: 'day-2',
  day_index: 1,
  day_label: 'Día 2',
  day_date: '2026-11-14',
  session_id: 'ses-b',
  session_name: 'Tanda B',
  platform: 'Plataforma 1',
  weigh_in_at: '2026-11-14T11:30:00.000Z',
  starts_at: '2026-11-14T13:00:00.000Z',
}

const MEMBERSHIP = {
  id: 'mem-1',
  year: '2026',
  status: 'activa',
  expiration_date: '2026-12-31',
  member_code: 'PLU-ARG-2026-014',
}

const EVENT = {
  event_slug: 'pitbull-classic-2026',
  event_title: 'Pitbull Classic 2026',
  event_starts_at: '2026-11-13T12:00:00.000Z',
}

const CREDENTIAL_CASES = {
  // Inscripto con grilla asignada: el caso que resuelve seguridad en la puerta.
  assigned: {
    athlete: { id: 'ath-1', full_name: 'Ana Torres' },
    membership: MEMBERSHIP,
    registration: {
      id: 'reg-1',
      status: 'confirmada',
      division: 'Open',
      category: 'Raw',
      ...EVENT,
      schedule: SCHEDULE,
      check_in: null,
    },
    registrations: [],
  },
  // Pagó, todavía sin grilla armada.
  pending: {
    athlete: { id: 'ath-2', full_name: 'Lucas Ferro' },
    membership: null,
    registration: {
      id: 'reg-2',
      status: 'confirmada',
      division: 'Open',
      category: 'Raw With Wraps',
      ...EVENT,
      schedule: null,
      check_in: null,
    },
    registrations: [],
  },
  // Ya entró.
  used: {
    athlete: { id: 'ath-4', full_name: 'Ana Torres' },
    membership: MEMBERSHIP,
    registration: {
      id: 'reg-4',
      status: 'confirmada',
      division: 'Open',
      category: 'Raw',
      ...EVENT,
      schedule: SCHEDULE,
      check_in: { id: 'chk-1', gate: 'Puerta 1', scanned_at: '2026-11-14T12:05:00.000Z' },
    },
    registrations: [],
  },
  // Escaneo sin ?evento=: lista de inscripciones vigentes.
  list: {
    athlete: { id: 'ath-3', full_name: 'Ana Torres' },
    membership: MEMBERSHIP,
    registration: null,
    registrations: [
      { id: 'reg-1', status: 'confirmada', division: 'Open', category: 'Raw', ...EVENT, schedule: SCHEDULE, check_in: null },
      {
        id: 'reg-2',
        status: 'pendiente_pago',
        division: 'Masters',
        category: 'Raw',
        event_slug: 'copa-invierno-2026',
        event_title: 'Copa Invierno 2026',
        event_starts_at: '2026-09-05T12:00:00.000Z',
        schedule: null,
        check_in: null,
      },
    ],
  },
  // Afiliación vencida.
  expired: {
    athlete: { id: 'ath-5', full_name: 'Martín Sosa' },
    membership: { ...MEMBERSHIP, status: 'vencida', expiration_date: '2025-12-31' },
    registration: {
      id: 'reg-5',
      status: 'confirmada',
      division: 'Open',
      category: 'Raw',
      ...EVENT,
      schedule: SCHEDULE,
      check_in: null,
    },
    registrations: [],
  },
  // Código que no resuelve a nadie.
  notfound: null,
}

const TICKET_CASES = {
  ticketValid: {
    ticket: {
      id: 'tkt-1',
      ticket_code: 'PLU-TKT-00241',
      qr_token: 'b4f1c0de-0000-4000-8000-000000000001',
      attendee_name: 'Camila Ruiz',
      attendee_dni: '38222111',
      ticket_type_name: 'Día 2 · General',
      status: 'pagada',
      addons: [],
    },
    event: { id: 'evt-1', slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
    checkIn: null,
  },
  ticketUsed: {
    ticket: {
      id: 'tkt-2',
      ticket_code: 'PLU-TKT-00242',
      qr_token: 'b4f1c0de-0000-4000-8000-000000000002',
      attendee_name: 'Camila Ruiz',
      attendee_dni: '38222111',
      ticket_type_name: 'Día 2 · General',
      status: 'pagada',
      addons: [],
    },
    event: { id: 'evt-1', slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
    checkIn: { id: 'chk-9', gate: 'Puerta 2', scanned_at: '2026-11-14T13:40:00.000Z' },
  },
}

const browser = await chromium.launch()
const problems = []

async function shoot(name, { payload, ticket, theme, width, query }) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
  })
  const page = await context.newPage()

  page.on('pageerror', (e) => problems.push(`${name}/${theme}/${width} pageerror: ${e.message}`))

  await page.route('**/rest/v1/rpc/get_membership_by_code_or_token', (route) =>
    payload
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      : route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"no"}' }),
  )
  // Las entradas se verifican por Express, no por RPC directa.
  await page.route('**/api/tickets/verify/**', (route) =>
    ticket
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ticket }),
        })
      : route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"no"}' }),
  )

  await page.addInitScript((t) => {
    try { localStorage.setItem('plu-theme', t) } catch { /* noop */ }
  }, theme)

  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  if (overflow) problems.push(`${name}/${theme}/${width}: overflow horizontal`)

  const panel = page.locator('.credential-page__panel')
  if (await panel.count()) {
    const text = await panel.innerText()
    if (theme === 'dark' && width === 390) {
      console.log(`\n===== ${name} =====\n${text}`)
    }
  }

  await page.screenshot({ path: `${OUT}${TAG}-${name}-${theme}-${width}.png`, fullPage: true })
  await context.close()
}

for (const [name, payload] of Object.entries(CREDENTIAL_CASES)) {
  const query =
    name === 'list'
      ? '?credencial=a4f1c0de-0000-4000-8000-000000000001'
      : '?credencial=a4f1c0de-0000-4000-8000-000000000001&evento=pitbull-classic-2026'
  for (const theme of ['dark', 'light']) {
    for (const width of [390, 900]) {
      await shoot(name, { payload, theme, width, query })
    }
  }
}

for (const [name, ticket] of Object.entries(TICKET_CASES)) {
  const query = `?credencial=${ticket.ticket.qr_token}&tipo=ticket`
  for (const theme of ['dark', 'light']) {
    for (const width of [390, 900]) {
      await shoot(name, { ticket, theme, width, query })
    }
  }
}

await browser.close()

if (problems.length) {
  console.log('\nPROBLEMAS:')
  for (const p of [...new Set(problems)]) console.log(' -', p)
  process.exit(1)
}
console.log('\nSin page errors ni overflow.')
