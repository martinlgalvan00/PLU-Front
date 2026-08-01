/**
 * Auditoría visual de las secciones "camino del competidor" y "programa del meet"
 * de la página Pitbull, en dark/light y desktop/mobile.
 */
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://localhost:5176'
const TARGETS = [
  { selector: '.pitbull-journey-layout', slug: 'journey' },
  { selector: '.pitbull-meet', slug: 'meet' },
]

const browser = await chromium.launch()

async function openPitbull(viewport) {
  const page = await browser.newPage({ viewport })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /pitbull classic/i }).first().click()
  await page.locator('.pitbull-page').first().waitFor({ state: 'visible', timeout: 15000 })
  return page
}

for (const viewport of [
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'mobile-390', width: 390, height: 844 },
]) {
  const page = await openPitbull({ width: viewport.width, height: viewport.height })

  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.setAttribute('data-theme', value)
    }, theme)

    for (const target of TARGETS) {
      const node = page.locator(target.selector).first()
      await node.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
      await node.screenshot({ path: `pitbull-${target.slug}-${viewport.name}-${theme}.png` })
    }
  }

  const probe = await page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { w: Math.round(rect.width), h: Math.round(rect.height) }
    }
    return {
      journey: box('.pitbull-journey-layout'),
      meet: box('.pitbull-meet'),
      journeySteps: document.querySelectorAll('.pitbull-journey__step').length,
      meetLanes: document.querySelectorAll('.pitbull-meet__lane').length,
      visualVisible:
        getComputedStyle(document.querySelector('.pitbull-journey-visual')).display !== 'none',
    }
  })
  console.log(viewport.name, JSON.stringify(probe))
  await page.close()
}

await browser.close()
