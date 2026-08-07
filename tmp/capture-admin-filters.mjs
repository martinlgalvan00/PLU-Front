import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = pathToFileURL(path.join(__dirname, 'admin-filters-fixture.html')).href

const viewports = [
  { name: '390', width: 390, height: 1100 },
  { name: '540', width: 540, height: 1100 },
  { name: '1280', width: 1280, height: 1100 },
]

const browser = await chromium.launch()
const page = await browser.newPage()

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.goto(fixture)
  await page.waitForTimeout(400)
  await page.screenshot({
    path: path.join(__dirname, `admin-filters-fixture-${vp.name}-dark.png`),
    fullPage: true,
  })

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    const link = [...document.querySelectorAll('link')].find((el) =>
      el.href.includes('themes/dark.css'),
    )
    if (link) link.href = link.href.replace('themes/dark.css', 'themes/light.css')
  })
  await page.waitForTimeout(350)
  await page.screenshot({
    path: path.join(__dirname, `admin-filters-fixture-${vp.name}-light.png`),
    fullPage: true,
  })

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const link = [...document.querySelectorAll('link')].find((el) =>
      el.href.includes('themes/light.css'),
    )
    if (link) link.href = link.href.replace('themes/light.css', 'themes/dark.css')
  })
}

await browser.close()
console.log('captured', viewports.length * 2, 'screenshots')
