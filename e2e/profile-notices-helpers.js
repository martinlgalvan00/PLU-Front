import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expect } from '@playwright/test'
import { ORG_ID } from './local-supabase.js'
import { acceptCookies } from './redeem-code.js'

const BENIGN_CONSOLE = [
  /Download the React DevTools/i,
  /favicon/i,
  /net::ERR_ABORTED/i,
  /ResizeObserver loop/i,
  /Failed to load resource: the server responded with a status of 4\d\d/i,
  /ApiError: No tenes permisos/i,
  /launch-interest/i,
]

export function watchPageErrors(page) {
  const errors = []

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (BENIGN_CONSOLE.some((pattern) => pattern.test(text))) return
    errors.push(`console: ${text}`)
  })
  page.on('response', (response) => {
    const url = response.url()
    if (!url.includes('/api/')) return
    if (response.status() < 500) return
    errors.push(`http ${response.status()}: ${url}`)
  })

  return {
    errors,
    async assertClean() {
      expect(errors, errors.join('\n')).toEqual([])
    },
  }
}

export async function insertIncompleteAthlete(admin, { run, suffix }) {
  const { data, error } = await admin
    .from('athletes')
    .insert({
      organization_id: ORG_ID,
      full_name: `E2E Aviso ${suffix} ${run}`,
      document_id: String(92_000_000 + Math.floor(Math.random() * 7_999_999)),
      email: `e2e-aviso-${suffix.toLowerCase()}-${run}@pluarg.test`,
      status: 'registrado',
      birth_date: '1996-03-12',
      sex: 'Masculino',
      country: 'Argentina',
      email_verified_at: new Date().toISOString(),
    })
    .select('id, full_name, email')
    .single()
  if (error) throw new Error(`No se pudo crear el atleta incompleto ${suffix}: ${error.message}`)
  return data
}

export async function writeAthleteAuthState(admin, athleteId, filePath) {
  const { ATHLETE_SESSION_COOKIE_NAME, createAthleteSession } = await import(
    '../server/services/athleteSessionService.js'
  )
  const session = await createAthleteSession({
    client: admin,
    athleteId,
    req: { get: () => undefined, ip: '127.0.0.1' },
  })
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    JSON.stringify({
      cookies: [
        {
          name: ATHLETE_SESSION_COOKIE_NAME,
          value: session.token,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      ],
      origins: [],
    }),
    'utf8',
  )
}

export async function deleteTestAthletes(admin, athleteIds) {
  for (const athleteId of athleteIds.filter(Boolean)) {
    await admin.from('athlete_profile_notices').delete().eq('athlete_id', athleteId)
    await admin.rpc('delete_athlete', {
      p_athlete_id: athleteId,
      p_actor: 'e2e:profile-notices-cleanup',
    })
  }
}

export function desktopNoticeBell(page) {
  return page.locator('.plu-global-nav__actions').getByRole('button', { name: /avisos/i })
}

export async function openPeopleAthletes(page) {
  await page
    .locator('.admin-shell .ant-menu-item')
    .filter({ has: page.getByText('Personas', { exact: true }) })
    .click()
  await expect(page.getByRole('heading', { name: /^Atletas$/i })).toBeVisible({ timeout: 20_000 })
  await expect(
    page.locator('.ant-table-row, .data-table-card, .admin-list-shell__empty').first(),
  ).toBeVisible({ timeout: 20_000 })
}

export async function searchAthlete(page, query) {
  const search = page.getByPlaceholder(/buscar por nombre, gimnasio, dni o email/i)
  await search.fill(query)
}

export async function openAthleteRow(page, fullName) {
  const row = page.locator('.ant-table-row, .data-table-card', { hasText: fullName }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.getByText(fullName, { exact: true }).click()
  await expect(page.locator('.athlete-detail')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.athlete-detail')).toContainText(fullName)
}

export async function goHomeLoggedIn(page) {
  await page.goto('/')
  await acceptCookies(page)
  await expect(page.locator('.plu-global-nav')).toBeVisible({ timeout: 15_000 })
}

export async function fillRequiredProfileFields(page) {
  await expect(page.getByRole('heading', { name: /datos personales/i })).toBeVisible()

  async function openGroup(contentId) {
    const content = page.locator(`#${contentId}`)
    if (await content.isHidden()) {
      await page
        .locator('.account-data-group')
        .filter({ has: page.locator(`#${contentId}`) })
        .locator('button.account-data-group__summary')
        .click()
    }
    await expect(content).toBeVisible()
  }

  await openGroup('account-contact-fields')
  await page.locator('#account-contact-fields input[name="phone"]').fill('1155559999')
  await page.locator('#account-contact-fields input[name="city"]').fill('CABA')
  await page.locator('#account-contact-fields input[name="province"]').fill('Buenos Aires')

  await openGroup('account-competition-fields')
  await page.locator('#account-competition-fields select[name="division"]').selectOption('Open')
  await page.locator('#account-competition-fields select[name="category"]').selectOption('Raw')
  await page.locator('#account-competition-fields input[name="estimatedWeight"]').fill('93')

  await openGroup('account-sports-fields')
  await page.locator('#account-sports-fields input[name="gym"]').fill('PLU Test Team')
  const sex = page.locator('#account-sports-fields select[name="sex"]')
  if (await sex.count()) {
    await sex.selectOption('Masculino')
  }

  await page.getByRole('button', { name: /guardar cambios/i }).click()
  const gymDialog = page.getByRole('dialog', { name: /confirmá el nombre de tu equipo/i })
  const dialogAppeared = await gymDialog
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (dialogAppeared) {
    await gymDialog.getByRole('button', { name: /sí, confirmar equipo/i }).click()
  }
  await expect(page.getByText(/tus datos se guardaron correctamente/i)).toBeVisible({
    timeout: 15_000,
  })
}
