import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(__dirname, 'membership-credential-modal-fixture.html')
const out = path.join(__dirname, 'membership-credential-modal-1280-dark.png')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`file://${fixture.replaceAll('\\', '/')}`)

const modal = page.locator('.membership-credential-modal')
const panel = page.locator('.membership-credential-modal__panel')
const modalBox = await modal.boundingBox()
const panelBox = await panel.boundingBox()
const modalStyles = await modal.evaluate((el) => {
  const s = getComputedStyle(el)
  return {
    position: s.position,
    display: s.display,
    zIndex: s.zIndex,
    inset: `${s.top} ${s.right} ${s.bottom} ${s.left}`,
  }
})

console.log(JSON.stringify({ modalStyles, modalBox, panelBox }, null, 2))
await page.screenshot({ path: out, fullPage: false })
await browser.close()
