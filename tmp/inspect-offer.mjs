import { chromium } from 'playwright'

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console error:', m.text())
})

await page.goto(`${BASE}/tmp/register-preview.html?flow=competition&theme=dark&filled=1`, {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(800)

const report = await page.evaluate(() => {
  const offers = [...document.querySelectorAll('.plu-checkout__offer')].map((el) => ({
    className: el.className,
    text: el.textContent.trim().replace(/\s+/g, ' '),
    height: Math.round(el.getBoundingClientRect().height),
    hasSeasonCombo: Boolean(el.querySelector('.season-combo-offer')),
    priceEl: el.querySelector('.plu-checkout__offer-price')?.textContent ?? null,
  }))
  const bar = document.querySelector('.plu-checkout__bar .plu-checkout__total strong')
  const ticket = document.querySelector('.register-competition-ticket__total strong')
  return {
    offers,
    barTotal: bar?.textContent ?? null,
    ticketTotal: ticket?.textContent ?? null,
  }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()
