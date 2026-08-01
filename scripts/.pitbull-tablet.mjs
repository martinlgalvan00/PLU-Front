/** Journey en el rango 640-1099px: los dos paneles de fase en paralelo. */
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://localhost:5176'
const browser = await chromium.launch()

for (const width of [768, 900]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /pitbull classic/i }).first().click()
  await page.locator('.pitbull-journey-layout').first().waitFor({ state: 'visible', timeout: 15000 })
  const node = page.locator('.pitbull-journey-layout').first()
  await node.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await node.screenshot({ path: `pitbull-journey-${width}-dark.png` })

  const probe = await page.evaluate(() => {
    const phases = [...document.querySelectorAll('.pitbull-journey__phase')]
    return {
      cols: getComputedStyle(document.querySelector('.pitbull-journey__phases')).gridTemplateColumns,
      accentTop: phases.map((el) => getComputedStyle(el).borderTopColor),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  console.log(width, JSON.stringify(probe))
  await page.close()
}

await browser.close()
