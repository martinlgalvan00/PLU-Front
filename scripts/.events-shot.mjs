/**
 * Captura la sección de eventos del admin en el preview aislado
 * (preview-events.html) para auditar el render real: ancho de notebook,
 * desktop amplio y mobile, en dark y light.
 *
 * Uso: node scripts/.events-shot.mjs [url]
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5233/preview-events.html'
const OUT = 'scripts/.events-shots'
const VIEWPORTS = [
  { name: 'notebook-863', width: 863, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 980 },
  { name: 'mobile-390', width: 390, height: 900 },
]

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  })
  await page.goto(url, { waitUntil: 'networkidle' })

  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.setAttribute('data-theme', value)
    }, theme)
    await page.waitForTimeout(350)

    await page.screenshot({ path: `${OUT}/${viewport.name}-${theme}.png` })
  }

  const metrics = await page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return { height: Math.round(box.height), width: Math.round(box.width) }
    }
    return {
      header: read('.admin-list-shell__header'),
      filters: read('.admin-list-shell--events .admin-filters'),
      list: read('.admin-event-list'),
      firstRow: read('.admin-event-row'),
      dateBlock: read('.admin-event-row__date'),
      panel: read('.admin-event-preview--panel'),
      groups: document.querySelectorAll('.admin-event-group').length,
      groupLabels: [...document.querySelectorAll('.admin-event-group__label')].map((node) =>
        node.textContent.trim(),
      ),
    }
  })
  console.log(`\n=== ${viewport.name} ===`)
  console.log(JSON.stringify(metrics, null, 2))

  await page.close()
}

await browser.close()
