import { chromium } from 'playwright'
const OUT = 'C:\\Users\\Equipo\\AppData\\Local\\Temp\\claude\\c--Users-Equipo-Desktop-Hobbies-PLU-Front\\73f2c329-8812-4cc5-921f-5b7ba10967e5\\scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.setItem('plu-arg-theme', 'dark'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.plu-global-nav')
await page.locator('.plu-global-nav__link', { hasText: 'Resultados' }).click()
await page.waitForTimeout(400)

const styles = await page.locator('.plu-global-nav__indicator').evaluate((el) => {
  const cs = getComputedStyle(el)
  return { transform: cs.transform, opacity: cs.opacity, background: cs.backgroundColor, position: cs.position, bottom: cs.bottom, height: cs.height }
})
console.log('indicator styles:', JSON.stringify(styles))

const box = await page.locator('.plu-global-nav__indicator').boundingBox()
console.log('indicator box:', JSON.stringify(box))

const resultsBox = await page.locator('.plu-global-nav__link', { hasText: 'Resultados' }).boundingBox()
console.log('results link box:', JSON.stringify(resultsBox))

// zoom crop around the nav row bottom edge
await page.locator('.plu-global-nav').screenshot({ path: `${OUT}/qa-indicator-zoom.png` })

await browser.close()
