import { chromium } from 'playwright'

const BASE_URL = process.env.VISUAL_CHECK_URL ?? 'http://localhost:5180'
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), 'dark')
await page.waitForFunction(() => typeof window.__pluNav === 'function')
await page.evaluate(() => window.__pluNav('pitbull'))
await page.waitForTimeout(1500)

const info = await page.evaluate(() => {
  const layout = document.querySelector('.pitbull-hero-masthead__layout--split')
  const panel = document.querySelector('.pitbull-hero-masthead__panel')
  const frame = document.querySelector('.pitbull-hero-masthead__frame')
  const cs = getComputedStyle(layout)
  return {
    alignItems: cs.alignItems,
    layoutRect: layout.getBoundingClientRect(),
    panelRect: panel.getBoundingClientRect(),
    frameRect: frame.getBoundingClientRect(),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
