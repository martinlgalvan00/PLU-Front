import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.setItem('plu-arg-theme', 'dark'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.plu-global-nav__menu-button')

const before = await page.locator('.plu-global-nav__menu-button i').evaluateAll((els) =>
  els.map((el) => getComputedStyle(el).transform),
)
console.log('bars before:', JSON.stringify(before))

await page.locator('.plu-global-nav__menu-button').click()
await page.waitForTimeout(350)

const after = await page.locator('.plu-global-nav__menu-button i').evaluateAll((els) =>
  els.map((el) => getComputedStyle(el).transform + ' | opacity:' + getComputedStyle(el).opacity),
)
console.log('bars after (expanded=true):', JSON.stringify(after))

await browser.close()
