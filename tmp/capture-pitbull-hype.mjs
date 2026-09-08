import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'pitbull-hype-qa')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()

async function go(theme) {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForFunction(() => typeof window.__pluNav === 'function')
  await page.evaluate(() => window.__pluNav('pitbull'))
  await page.waitForTimeout(900)
}

const shots = []
for (const theme of ['dark', 'light']) {
  for (const vp of [
    { name: '768', width: 768, height: 1024 },
    { name: '1400', width: 1400, height: 900 },
    { name: '390', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await go(theme)

    const counter = page.locator('.pitbull-inscription-counter--deck').first()
    const tickets = page.locator('#entradas').first()
    await counter.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const counterPath = path.join(outDir, `${theme}-${vp.name}-counter.png`)
    await counter.screenshot({ path: counterPath })

    await tickets.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const ticketsPath = path.join(outDir, `${theme}-${vp.name}-tickets.png`)
    await tickets.screenshot({ path: ticketsPath })

    const info = await page.evaluate(() => {
      const c = document.querySelector('.pitbull-inscription-counter--deck')
      const stat = c?.querySelector('.pitbull-inscription-counter__stat')
      const row = c?.querySelector('.pitbull-inscription-counter__row')
      const mark = c?.querySelector('.pitbull-inscription-counter__mark')
      const value = c?.querySelector('.pitbull-inscription-counter__value')
      const band = document.querySelector('#entradas')
      const rowBox = row?.getBoundingClientRect()
      const statBox = stat?.getBoundingClientRect()
      return {
        hidden: c?.classList.contains('pitbull-inscription-counter--hidden') ?? false,
        mark: mark?.textContent ?? null,
        value: value?.textContent ?? null,
        statCenterOffset: statBox && rowBox ? Math.round(statBox.left + statBox.width / 2 - (rowBox.left + rowBox.width / 2)) : null,
        ticketsSoon: band?.classList.contains('pitbull-tickets-band--soon') ?? false,
        ticketsTitle: band?.querySelector('.pitbull-tickets-band__title')?.textContent ?? null,
        ticketsCta: Boolean(band?.querySelector('.pitbull-tickets-band__cta')),
      }
    })
    shots.push({ theme, vp: vp.name, ...info, counterPath, ticketsPath })
  }
}

await browser.close()
console.log(JSON.stringify(shots, null, 2))
