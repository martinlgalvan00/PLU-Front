// Smoke visual multi-página: overflow horizontal + errores de consola + screenshots.
// Uso: VISUAL_CHECK_URL=http://localhost:5175 node scripts/smoke-pages.mjs
// Screenshots en scripts/.visual-check-output/smoke/ (gitignored).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '.visual-check-output', 'smoke')
const BASE_URL = process.env.VISUAL_CHECK_URL || 'http://localhost:5173'

const PAGES = ['home', 'events', 'members', 'faq', 'contact', 'results']
const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 },
]

mkdirSync(OUT_DIR, { recursive: true })

const failures = []
const consoleErrors = []

async function run() {
  const browser = await chromium.launch()

  for (const vp of VIEWPORTS) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await ctx.newPage()
      const label = `${vp.name}-${theme}`
      page.on('pageerror', (e) => consoleErrors.push(`[${label}] ${e.message}`))

      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      await page.waitForFunction(() => typeof window.__pluNav === 'function')

      for (const view of PAGES) {
        await page.evaluate((v) => window.__pluNav(v), view)
        await page.waitForTimeout(900)

        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }))
        if (scrollWidth > innerWidth + 1) {
          failures.push(`Overflow en ${view} (${label}): scrollWidth=${scrollWidth} > ${innerWidth}`)
        }

        await page.screenshot({ path: join(OUT_DIR, `${view}-${label}.png`), fullPage: false })
        console.log(`· ${view} — ${label} (scrollWidth=${scrollWidth})`)
      }
      await ctx.close()
    }
  }

  await browser.close()

  console.log('\n──────────────────────────────')
  if (consoleErrors.length) {
    consoleErrors.forEach((e) => console.error(`✗ Consola: ${e}`))
  } else {
    console.log('✓ Sin errores de consola')
  }
  if (failures.length) {
    failures.forEach((f) => console.error(`✗ ${f}`))
    console.log(`Resultado: FAIL (${failures.length + consoleErrors.length})`)
    process.exit(1)
  }
  console.log('Resultado: PASS')
}

run().catch((e) => {
  console.error('Error ejecutando smoke:', e)
  process.exit(1)
})
