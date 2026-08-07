import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.PLU_URL || 'http://localhost:5173'

const viewports = [
  { name: '390', width: 390, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '1366', width: 1366, height: 900 },
]

const sections = [
  { key: 'benefits', selector: '.members-benefits' },
  { key: 'process', selector: '.members-plu-stepper' },
  { key: 'requirements', selector: '.members-plu-block--requirements' },
]

const browser = await chromium.launch()
const page = await browser.newPage()

async function goMembers(theme) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme)
    if (typeof window.__pluNav === 'function') window.__pluNav('members')
  }, theme)
  await page.waitForSelector('.members-page--plu-ref', { timeout: 15000 })
  await page.waitForTimeout(700)
}

for (const theme of ['dark', 'light']) {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await goMembers(theme)

    for (const section of sections) {
      const el = page.locator(section.selector).first()
      await el.scrollIntoViewIfNeeded()
      await page.waitForTimeout(350)
      await el.screenshot({
        path: path.join(__dirname, `members-craft-${section.key}-${vp.name}-${theme}.png`),
      })
    }
  }
}

await browser.close()
console.log('captured', viewports.length * 2 * sections.length, 'screenshots')
