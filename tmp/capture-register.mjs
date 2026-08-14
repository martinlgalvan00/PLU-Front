import { chromium } from 'playwright'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'register-shots')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5173'
const flow = process.env.FLOW ?? 'competition'
const suffix = process.env.SUFFIX ?? 'before'
const pm = process.env.PM ?? 'mercado_pago'

const viewports = [
  { name: '390', width: 390, height: 900 },
  { name: '703', width: 703, height: 900 },
  { name: '834', width: 834, height: 1000 },
  { name: '1024', width: 1024, height: 900 },
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
]

const browser = await chromium.launch()
const errors = []

for (const vp of viewports) {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      deviceScaleFactor: 1,
    })
    await ctx.addInitScript((next) => {
      localStorage.setItem('plu-arg-theme', next)
    }, theme)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`[${vp.name}-${theme}] ${e.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${vp.name}-${theme}] console: ${msg.text()}`)
    })

    await page.goto(`${BASE}/tmp/register-preview.html?flow=${flow}&theme=${theme}&filled=1&pm=${pm}`, {
      waitUntil: 'networkidle',
    })
    await page.waitForTimeout(700)
    // Las entradas usan whileInView: sin recorrer la página, lo que quedó bajo
    // el pliegue se fotografía en opacity 0.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(600)

    const metrics = await page.evaluate(() => {
      const main = document.querySelector('main.register-page')
      const shell = document.querySelector('.register-shell')
      const aside = document.querySelector('.register-aside--desktop')
      const mobileContext = document.querySelector('.register-mobile-context')
      const choices = [...document.querySelectorAll('.field__choice')]
      const box = (el) => (el ? {
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      } : null)
      const small = choices
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.height < 44))
        .map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`)
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        pageHeight: main ? Math.round(main.getBoundingClientRect().height) : null,
        shell: box(shell),
        shellColumns: shell ? getComputedStyle(shell).gridTemplateColumns : null,
        asideDisplay: aside ? getComputedStyle(aside).display : null,
        mobileContextDisplay: mobileContext ? getComputedStyle(mobileContext).display : null,
        choiceCount: choices.length,
        choicesUnder44: small,
      }
    })

    console.log(`\n=== ${vp.name} ${theme} ===`)
    console.log(JSON.stringify(metrics, null, 2))

    await page.screenshot({
      path: path.join(OUT, `${flow}-${vp.name}-${theme}-${suffix}.png`),
      fullPage: true,
    })
    await ctx.close()
  }
}

await browser.close()

if (errors.length) {
  console.log('\n--- errores ---')
  errors.forEach((e) => console.log(e))
} else {
  console.log('\nSin errores de consola.')
}
