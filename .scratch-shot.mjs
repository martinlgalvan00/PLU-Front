import { chromium } from 'playwright'

const url = process.argv[2]
const outPath = process.argv[3]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(800)
await page.screenshot({ path: outPath, fullPage: true })
await browser.close()
console.log('saved', outPath)
