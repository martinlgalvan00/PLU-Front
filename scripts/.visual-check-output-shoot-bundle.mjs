import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2]
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:6006/iframe.html'
const STORIES = ['cuenta-secretbundlesection--disponible', 'cuenta-secretbundlesection--reservado', 'cuenta-secretbundlesection--buscando']
const THEMES = ['dark', 'light']
const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 900 },
  { name: 'desktop-1366', width: 1366, height: 900 },
]

const browser = await chromium.launch()
const problems = []
for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  for (const story of STORIES) {
    for (const theme of THEMES) {
      await page.goto(`${BASE}?id=${story}&globals=theme:${theme}`, { waitUntil: 'load' })
      await page.waitForSelector('#account-offer', { timeout: 15000 })
      await page.waitForTimeout(700)
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      // Targets tactiles de los controles de la ficha.
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('#account-offer button, #account-offer select, #account-offer input, #account-offer a')]
          .filter((node) => node.offsetParent !== null)
          .map((node) => ({ tag: node.tagName, text: (node.textContent || '').trim().slice(0, 24), w: Math.round(node.getBoundingClientRect().width), h: Math.round(node.getBoundingClientRect().height) }))
          .filter((box) => box.h < 44 && box.w < 44))
      if (overflow) problems.push(`overflow ${story} ${theme} ${viewport.name}`)
      if (small.length) problems.push(`target chico ${story} ${theme} ${viewport.name}: ${JSON.stringify(small)}`)
      await page.screenshot({ path: `${OUT}/${story}-${theme}-${viewport.name}.png`, fullPage: true })
      console.log(`ok ${story} ${theme} ${viewport.name} bg=${bg}`)
    }
  }
  if (errors.length) problems.push(`errores de consola ${viewport.name}: ${errors.slice(0, 4).join(' | ')}`)
  await page.close()
}
await browser.close()
console.log(problems.length ? `PROBLEMAS:\n- ${problems.join('\n- ')}` : 'sin overflow, sin targets chicos, sin errores de consola')
