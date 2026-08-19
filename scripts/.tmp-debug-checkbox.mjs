import { chromium } from 'playwright'

const BASE = 'http://localhost:6006/iframe.html?id=admin-admindatatable--con-seleccion&viewMode=story&globals=theme:dark;locale:es'

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.ant-table-wrapper')

  const css = await page.evaluate(() => {
    const out = []
    for (const styleEl of document.querySelectorAll('style')) {
      if (styleEl.textContent.includes('ant-checkbox')) {
        out.push(styleEl.textContent)
      }
    }
    return out.join('\n---SHEET---\n')
  })
  console.log(css)

  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
