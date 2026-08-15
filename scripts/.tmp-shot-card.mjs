import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = 'C:\\Users\\agusd\\AppData\\Local\\Temp\\claude\\c--Users-agusd-OneDrive-Escritorio-Hobbie-PLU-Front\\c907cde7-f63b-42bf-a2a0-09593f9ac4b9\\scratchpad'
mkdirSync(OUT_DIR, { recursive: true })

const BASE = 'http://localhost:6007'

const targets = [
  { id: 'ui-eventsharecard--membership-with-photo', name: 'membership-square-v2' },
  { id: 'ui-eventsharecard--membership-with-photo-story', name: 'membership-story-v2' },
  { id: 'ui-eventsharecard--membership-no-photo', name: 'membership-square-nophoto-v2' },
  { id: 'ui-eventsharecard--membership-no-photo-story', name: 'membership-story-nophoto-v2' },
]

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } })

  for (const target of targets) {
    await page.goto(`${BASE}/iframe.html?id=${target.id}&viewMode=story`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await page.screenshot({ path: join(OUT_DIR, `${target.name}.png`), fullPage: true })
    console.log('shot', target.name)
  }

  await browser.close()
  console.log('done')
}

run().catch((e) => { console.error(e); process.exit(1) })
