import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'conversion-polish')
mkdirSync(outDir, { recursive: true })
const baseUrl = process.env.PLU_URL || 'http://localhost:5173'

const viewports = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1400', width: 1400, height: 900 },
]

const shots = [
  { view: 'home', selector: '.pitbull-spotlight--home', key: 'home-spotlight' },
  { view: 'home', selector: '.home-membership-band', key: 'home-membership' },
  { view: 'members', selector: '#planes', key: 'members-planes' },
  { view: 'pitbull', selector: '#inscripcion', key: 'pitbull-inscripcion' },
]

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
const measures = []

async function go(view, theme) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForFunction(() => typeof window.__pluNav === 'function')
  await page.evaluate((v) => window.__pluNav(v), view)
  await page.waitForTimeout(800)
}

for (const theme of ['dark', 'light']) {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const shot of shots) {
      await go(shot.view, theme)
      const el = page.locator(shot.selector).first()
      await el.scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
      const box = await el.boundingBox()
      measures.push({
        key: shot.key,
        theme,
        vp: vp.name,
        width: box ? Math.round(box.width) : null,
        height: box ? Math.round(box.height) : null,
      })
      await el.screenshot({
        path: path.join(outDir, `${shot.key}-${vp.name}-${theme}.png`),
      })
    }
  }
}

await browser.close()
console.log(JSON.stringify(measures, null, 2))
console.log('captured', measures.length, 'screenshots')
