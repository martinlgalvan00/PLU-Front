#!/usr/bin/env node
/**
 * Visual QA para páginas públicas (foco actual: Pitbull Classic).
 *
 * Uso:
 *   1. En una terminal: npm run dev:web   (deja el server corriendo en :5183)
 *   2. En otra terminal: node scripts/visual-check.mjs
 *
 * Variables opcionales:
 *   VISUAL_CHECK_URL   base URL del server (default http://localhost:5183)
 *
 * Qué valida:
 *   - Overflow horizontal en notebook/mobile/desktop, light y dark.
 *   - Errores de consola (page errors) durante navegación e interacción.
 *   - Navegación entre las seis secciones del dossier actual del evento.
 *   - Reduced motion: el contenido debe quedar completo sin animación.
 *   - Tamaño mínimo de targets táctiles (44×44px) en los controles
 *     interactivos de navegación, inscripción, reglamento y mapas.
 *
 * No reemplaza una suite de Playwright Test formal (el repo no tiene
 * @playwright/test como dependencia); usa la librería `playwright`, que
 * ya está instalada, en un script simple y reproducible.
 *
 * Salida: screenshots en scripts/.visual-check-output/ (gitignored) y un
 * resumen en consola. Exit code 1 si algo falla.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '.visual-check-output')
mkdirSync(OUT_DIR, { recursive: true })

const BASE_URL = process.env.VISUAL_CHECK_URL ?? 'http://localhost:5183'

const BREAKPOINTS = [
  { name: 'notebook-1366', width: 1366, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
]

const MIN_TAP_TARGET = 44

const failures = []
const notes = []

function fail(message) {
  failures.push(message)
  console.error(`✗ ${message}`)
}

function pass(message) {
  console.log(`✓ ${message}`)
}

async function gotoPitbull(page, { theme = 'dark', reducedMotion = false } = {}) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForFunction(() => typeof window.__pluNav === 'function')
  await page.evaluate(() => window.__pluNav('pitbull'))
  await page.waitForTimeout(700)
}

async function checkOverflow(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  if (scrollWidth > innerWidth + 1) {
    fail(`Overflow horizontal en ${label}: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`)
  } else {
    pass(`Sin overflow horizontal — ${label}`)
  }
}

async function checkTapTargets(page, label) {
  const selectors = [
    '.pitbull-section-nav__item',
    '.pitbull-hero-masthead__cta',
    '.pitbull-inscription__cta',
    '.pitbull-venue__directions',
    '.pitbull-cat__rulebook',
    '.pitbull-tickets-band__cta',
  ]
  for (const selector of selectors) {
    const boxes = await page.$$eval(selector, (els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    boxes.forEach((box, i) => {
      if (box.width < MIN_TAP_TARGET || box.height < MIN_TAP_TARGET) {
        fail(
          `Target táctil chico (${label}) en ${selector}[${i}]: ${Math.round(box.width)}×${Math.round(box.height)}px (mínimo ${MIN_TAP_TARGET}px)`,
        )
      }
    })
    if (boxes.length > 0) pass(`Targets táctiles OK — ${selector} (${label}, ${boxes.length} elementos)`)
  }
}

async function run() {
  const browser = await chromium.launch()
  const consoleErrors = []

  for (const bp of BREAKPOINTS) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height } })
      const page = await ctx.newPage()
      const label = `${bp.name}-${theme}`
      page.on('pageerror', (e) => consoleErrors.push(`[${label}] ${e.message}`))

      await gotoPitbull(page, { theme })
      await checkOverflow(page, label)

      if (bp.width >= 1024) {
        // Dossier actual: las seis anclas deben navegar y quedar activas.
        const navItems = await page.$$('.pitbull-section-nav__item')
        if (navItems.length !== 6) {
          fail(`Se esperaban 6 secciones en el dossier (${label}), se encontraron ${navItems.length}`)
        } else {
          for (let i = 0; i < navItems.length; i += 1) {
            await navItems[i].click()
            await page.waitForTimeout(150)
            const current = await navItems[i].getAttribute('aria-current')
            if (current !== 'location') {
              fail(`La sección ${i + 1} no quedó activa al navegar (${label})`)
            }
          }
          pass(`Navegación del dossier: 6 secciones funcionales — ${label}`)
        }
        await checkTapTargets(page, label)
      }

      await page.screenshot({ path: join(OUT_DIR, `${label}.png`), fullPage: false })
      await ctx.close()
    }
  }

  // Reduced motion: el contenido debe estar completo sin interacción.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      reducedMotion: 'reduce',
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => consoleErrors.push(`[reduced-motion] ${e.message}`))
    await gotoPitbull(page, { theme: 'dark', reducedMotion: true })
    const sectionsVisible = await page.$$eval('.pitbull-section-nav__item', (els) => els.length)
    if (sectionsVisible === 6) {
      pass('Reduced motion: las 6 secciones del dossier están presentes sin interacción')
    } else {
      fail(`Reduced motion: se esperaban 6 secciones, se encontraron ${sectionsVisible}`)
    }
    await page.screenshot({ path: join(OUT_DIR, 'reduced-motion.png') })
    await ctx.close()
  }

  await browser.close()

  if (consoleErrors.length > 0) {
    consoleErrors.forEach((e) => fail(`Error de consola: ${e}`))
  } else {
    pass('Sin errores de consola en ningún escenario')
  }

  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify({ failures, notes }, null, 2))

  console.log('\n──────────────────────────────')
  console.log(`Resultado: ${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`}`)
  console.log(`Screenshots: ${OUT_DIR}`)
  console.log('──────────────────────────────\n')

  if (failures.length > 0) process.exitCode = 1
}

run().catch((err) => {
  console.error('Error ejecutando visual-check:', err)
  process.exitCode = 1
})
