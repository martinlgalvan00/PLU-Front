// Auditoría puntual: nav mobile (cluster + drawer), home-teaser-duo,
// pitbull-section-nav. Corre igual antes y después de un cambio para
// comparar evidencia. Screenshots en .visual-check-output/targets/<run>/
// Uso: VISUAL_CHECK_URL=http://localhost:5175 RUN_TAG=antes node scripts/audit-targets.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUN_TAG = process.env.RUN_TAG || 'run'
const OUT_DIR = join(__dirname, '.visual-check-output', 'targets', RUN_TAG)
const BASE_URL = process.env.VISUAL_CHECK_URL || 'http://localhost:5173'

mkdirSync(OUT_DIR, { recursive: true })

const consoleErrors = []

async function openPage(browser, { width, height, theme }) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForFunction(() => typeof window.__pluNav === 'function')
  return { ctx, page }
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: false })
  console.log(`· ${name}`)
}

async function run() {
  const browser = await chromium.launch()

  for (const theme of ['dark', 'light']) {
    // --- Mobile 390 ---
    const mob = await openPage(browser, { width: 390, height: 844, theme })
    await shot(mob.page, `nav-top-mobile-${theme}`)

    // Skeleton de sesión: demorar el probe /api/auth/me y capturar temprano.
    const slow = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const slowPage = await slow.newPage()
    await slowPage.route('**/api/auth/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"user":null}' })
    })
    await slowPage.evaluate(() => {})
    await slowPage.goto(`${BASE_URL}/`, { waitUntil: 'commit' })
    await slowPage.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await slowPage.waitForSelector('.plu-global-nav__mobile-cluster', { timeout: 15000 })
    await slowPage.waitForTimeout(700)
    await slowPage.screenshot({ path: join(OUT_DIR, `nav-skeleton-mobile-${theme}.png`) })
    console.log(`· nav-skeleton-mobile-${theme}`)
    await slow.close()

    // Drawer abierto
    await mob.page.click('.plu-global-nav__menu-button')
    await mob.page.waitForTimeout(600)
    await shot(mob.page, `drawer-open-mobile-${theme}`)
    await mob.page.keyboard.press('Escape')
    await mob.page.waitForTimeout(400)

    // Teaser duo en home
    await mob.page.evaluate(() => {
      document.querySelector('.home-teaser-duo')?.scrollIntoView({ block: 'center', behavior: 'instant' })
    })
    await mob.page.waitForTimeout(1200)
    await shot(mob.page, `teaser-duo-mobile-${theme}`)

    // Pitbull section nav
    await mob.page.evaluate(() => window.__pluNav('pitbull'))
    await mob.page.waitForTimeout(900)
    await mob.page.evaluate(() => {
      document.querySelector('.pitbull-section-nav__track')?.scrollTo({ left: 0, behavior: 'instant' })
      document.querySelector('.pitbull-section-nav')?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
    await mob.page.waitForTimeout(500)
    await shot(mob.page, `pitbull-nav-mobile-${theme}`)

    // Estado activo real: tocar "Categorías" y esperar el scroll-spy.
    await mob.page.click('[data-section-id="categorias"]')
    await mob.page.waitForTimeout(1400)
    await mob.page.evaluate(() => {
      document.querySelector('.pitbull-section-nav')?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
    await mob.page.waitForTimeout(300)
    await shot(mob.page, `pitbull-nav-active-mobile-${theme}`)
    await mob.ctx.close()

    // --- Desktop 1280 ---
    const desk = await openPage(browser, { width: 1280, height: 800, theme })
    await desk.page.evaluate(() => {
      document.querySelector('.home-teaser-duo')?.scrollIntoView({ block: 'center', behavior: 'instant' })
    })
    await desk.page.waitForTimeout(1200)
    await shot(desk.page, `teaser-duo-desktop-${theme}`)

    await desk.page.evaluate(() => window.__pluNav('pitbull'))
    await desk.page.waitForTimeout(900)
    await desk.page.evaluate(() => {
      document.querySelector('.pitbull-section-nav')?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
    await desk.page.waitForTimeout(500)
    await shot(desk.page, `pitbull-nav-desktop-${theme}`)
    await desk.ctx.close()
  }

  await browser.close()
  console.log('\n──────────────────────────────')
  if (consoleErrors.length) {
    consoleErrors.forEach((e) => console.error(`✗ Consola: ${e}`))
    process.exit(1)
  }
  console.log('✓ Sin errores de consola — capturas en', OUT_DIR)
}

run().catch((e) => {
  console.error('Error ejecutando auditoría:', e)
  process.exit(1)
})
