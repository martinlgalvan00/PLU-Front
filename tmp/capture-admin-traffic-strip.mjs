import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const fixture = pathToFileURL(path.join(__dirname, 'admin-traffic-strip-fixture.html')).href
const lightCss = path.join(root, 'src/styles/themes/light.css')

const viewports = [
  { name: '390', width: 390, height: 420 },
  { name: '768', width: 768, height: 420 },
  { name: '1024', width: 1024, height: 420 },
]

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.goto(fixture)
  await page.waitForTimeout(200)
  await page.screenshot({
    path: path.join(__dirname, `admin-traffic-strip-${vp.name}-dark.png`),
    fullPage: true,
  })

  await page.addStyleTag({ path: lightCss })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.waitForTimeout(200)
  await page.screenshot({
    path: path.join(__dirname, `admin-traffic-strip-${vp.name}-light.png`),
    fullPage: true,
  })
}

await browser.close()
console.log('captured', viewports.length * 2, 'screenshots')
