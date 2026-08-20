import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = 'C:\\Users\\agusd\\AppData\\Local\\Temp\\claude\\c--Users-agusd-OneDrive-Escritorio-Hobbie-PLU-Front\\03fde54d-9d33-4449-bc28-4c6c6bad7280\\scratchpad\\shots'
mkdirSync(OUT_DIR, { recursive: true })

const BASE = 'http://localhost:6006/iframe.html?id=admin-admindatatable--con-seleccion&viewMode=story'

async function run() {
  const browser = await chromium.launch()

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto(`${BASE}&globals=theme:${theme};locale:es`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    console.log(`[${theme}] title:`, await page.title())
    await page.screenshot({ path: join(OUT_DIR, `debug-${theme}.png`) })
    await page.waitForSelector('.ant-table-wrapper', { timeout: 15000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT_DIR, `table-${theme}-normal.png`) })

    await page.click('tr[data-row-key="1"] .ant-checkbox', { force: true })
    await page.waitForTimeout(150)
    await page.click('tr[data-row-key="2"] .ant-checkbox', { force: true })
    await page.waitForTimeout(350)
    await page.screenshot({ path: join(OUT_DIR, `table-${theme}-bulk.png`) })

    if (errors.length) {
      console.log(`[${theme}] ERRORES DE CONSOLA:`)
      errors.forEach((e) => console.log('  -', e))
    } else {
      console.log(`[${theme}] sin errores de consola`)
    }

    await ctx.close()
  }

  await browser.close()
  console.log('Screenshots en', OUT_DIR)
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
