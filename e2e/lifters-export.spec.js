import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './admin-helpers.js'
import { deleteEventsByIds } from './fixture-cleanup.js'
import { FIXTURE_PATH } from './global-setup.js'
import { ORG_ID, resolveLocalSupabase } from './local-supabase.js'

/**
 * Export Lifters: el Excel descargado trae el header fijo de LiftingCast
 * (birthDate en DD/MM/YYYY) y la hoja Summary. Corre contra la API real.
 */

function sheetRows(xml, sheetName) {
  const marker = `ss:Name="${sheetName}"`
  const start = xml.indexOf(marker)
  if (start < 0) return []
  const slice = xml.slice(start)
  const end = slice.indexOf('</Worksheet>')
  const table = end >= 0 ? slice.slice(0, end) : slice
  return [...table.matchAll(/<Row\b[\s\S]*?<\/Row>/g)].map((match) =>
    [...match[0].matchAll(/<Data ss:Type="String">([^<]*)<\/Data>/g)].map((cell) =>
      cell[1]
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"'),
    ),
  )
}

function indexByHeader(rows) {
  const headers = rows[0] ?? []
  return Object.fromEntries(headers.map((header, index) => [header, index]))
}

let admin
let fixture
const created = { events: [], athletes: [], registrations: [] }

const PEOPLE = [
  { suffix: 'Ana', birthDate: '1992-02-19', sex: 'Femenino' },
  { suffix: 'Luis', birthDate: '2005-06-01', sex: 'Masculino' },
]

test.describe('Export Lifters — fechas y estructura', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })

  test.beforeAll(async () => {
    fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
    const supabase = resolveLocalSupabase()
    admin = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const run = randomUUID().slice(0, 8)
    const startsAt = '2026-10-19T15:00:00.000Z'
    const { data: event, error: eventError } = await admin
      .from('events')
      .insert({
        organization_id: ORG_ID,
        slug: `e2e-lifters-${run}`,
        title: `E2E Lifters ${run}`,
        venue: 'QA Gym',
        location: 'CABA',
        price: 50000,
        currency: 'ARS',
        status: 'inscripcion_abierta',
        published: true,
        starts_at: startsAt,
        ends_at: '2026-10-19T22:00:00.000Z',
      })
      .select('id, slug')
      .single()
    if (eventError) throw new Error(`event: ${eventError.message}`)
    created.events.push(event.id)

    for (const person of PEOPLE) {
      const { data: athlete, error: athleteError } = await admin
        .from('athletes')
        .insert({
          organization_id: ORG_ID,
          full_name: `E2E Lifters ${person.suffix} ${run}`,
          document_id: String(80_000_000 + Math.floor(Math.random() * 9_000_000)),
          email: `e2e-lifters-${person.suffix.toLowerCase()}-${run}@pluarg.test`,
          birth_date: person.birthDate,
          sex: person.sex,
          country: 'Argentina',
          status: 'registrado',
          email_verified_at: new Date().toISOString(),
        })
        .select('id, full_name')
        .single()
      if (athleteError) throw new Error(`athlete: ${athleteError.message}`)
      created.athletes.push(athlete.id)
      person.fullName = athlete.full_name

      const { data: registration, error: registrationError } = await admin
        .from('event_registrations')
        .insert({
          organization_id: ORG_ID,
          athlete_id: athlete.id,
          event_id: event.id,
          division: 'Open',
          category: 'Raw',
          status: 'confirmada',
        })
        .select('id')
        .single()
      if (registrationError) throw new Error(`registration: ${registrationError.message}`)
      created.registrations.push(registration.id)
    }
  })

  test.afterAll(async () => {
    if (!admin) return
    if (created.registrations.length) {
      await admin.from('event_registrations').delete().in('id', created.registrations)
    }
    if (created.athletes.length) {
      await admin.from('athletes').delete().in('id', created.athletes)
    }
    await deleteEventsByIds(admin, created.events)
  })

  test('el Excel Lifters trae el header fijo y la fecha en DD/MM/YYYY', async ({ page }) => {
    await loginAsAdmin(page, {
      email: fixture.adminEmail,
      password: fixture.adminPassword,
    })

    await page
      .locator('.admin-shell .ant-menu-item')
      .filter({ has: page.getByText('Personas', { exact: true }) })
      .click()
    await page.getByRole('tab', { name: /^Inscripciones$/i }).click()
    await expect(page.getByRole('heading', { name: /^Inscripciones$/i })).toBeVisible({
      timeout: 20_000,
    })

    await page.getByRole('button', { name: /planilla lifters/i }).click()
    const panel = page.getByRole('region', { name: /planilla lifters/i })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: /studio de export/i })).toBeVisible()
    await expect(panel.getByText(/preview:/i)).toBeVisible({ timeout: 20_000 })

    const preset = panel.locator('label').filter({ hasText: 'Plantilla' }).locator('select')
    await preset.selectOption('official')
    await expect(panel.getByText(/preview:/i)).toContainText(/columnas/i)

    const downloadPromise = page.waitForEvent('download')
    await panel.getByRole('button', { name: /descargar excel/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/lifters-export.*\.xls$/i)

    const xml = (await readFile(await download.path())).toString('utf8')
    const lifters = sheetRows(xml, 'Lifters')
    const headers = indexByHeader(lifters)
    expect(typeof headers.birthDate).toBe('number')
    expect(typeof headers.name).toBe('number')
    expect(typeof headers.bodyWeight).toBe('number')
    expect(typeof headers.declaredAwardsWeightClass).toBe('number')
    expect(typeof headers.squatRackHeight).toBe('number')
    expect(typeof headers.notes).toBe('number')

    for (const person of PEOPLE) {
      const [year, month, day] = person.birthDate.split('-')
      const row = lifters.find((cells) => cells[headers.name] === person.fullName)
      expect(row, person.fullName).toBeTruthy()
      expect(row[headers.birthDate]).toBe(`${day}/${month}/${year}`)
    }

    const summary = sheetRows(xml, 'Summary')
    expect(summary.length).toBeGreaterThan(1)
    expect(summary[0]).toEqual(expect.arrayContaining(['Type', 'Item', 'Count']))
    expect(summary.some((row) => row[0] === 'Summary' && row[1] === 'Registered')).toBe(true)
  })
})
