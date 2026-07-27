import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('scripts/.qa9', { recursive: true })
const BASE_URL = process.env.VISUAL_CHECK_URL ?? 'http://localhost:5180'
const NAME = process.argv[2] ?? 'shot'
const WIDTH = Number(process.argv[3] ?? 1440)
const THEME = process.argv[4] ?? 'dark'
const HEIGHT = Number(process.argv[5] ?? 900)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: WIDTH, height: HEIGHT })
await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), THEME)
await page.waitForFunction(() => typeof window.__pluNav === 'function')
await page.evaluate(() => window.__pluNav('pitbull'))
await page.waitForTimeout(2000)
await page.screenshot({ path: `scripts/.qa9/${NAME}-${WIDTH}-${THEME}.png` })
await browser.close()
