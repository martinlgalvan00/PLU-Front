import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = pathToFileURL(path.join(__dirname, 'registrations-filters-fixture.html')).href

const viewports = [
  { name: '390', width: 390, height: 1200 },
  { name: '1440', width: 1440, height: 1400 },
]

const browser = await chromium.launch()
const page = await browser.newPage()

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.goto(fixture)
  await page.waitForTimeout(400)

  for (const theme of ['dark', 'light']) {
    await page.evaluate((next) => {
      document.documentElement.setAttribute('data-theme', next)
      const link = [...document.querySelectorAll('link')].find((el) => /themes\/(dark|light)\.css/.test(el.href))
      if (link) link.href = link.href.replace(/themes\/(dark|light)\.css/, `themes/${next}.css`)
    }, theme)
    await page.waitForTimeout(350)
    await page.screenshot({
      path: path.join(__dirname, `registrations-filters-${vp.name}-${theme}.png`),
      fullPage: true,
    })
  }

  const report = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-fixture-panel]')].map((panel) => {
      const groups = panel.querySelector('.admin-filters__groups--multi')
      const labels = [...panel.querySelectorAll('.admin-filter-group__label')]
      const trigger = panel.querySelector('.data-table-mobile-toolbar__trigger')
      const exportBtn = panel.querySelector('.admin-filters__actions .export-btn')
      const rails = [...panel.querySelectorAll('.admin-filter-chips')]
      return {
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        groupsDirection: groups ? getComputedStyle(groups).flexDirection : null,
        groupsOverflowX: groups ? getComputedStyle(groups).overflowX : null,
        visibleLabels: labels
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => el.textContent.trim()),
        triggerHeight: trigger ? Math.round(trigger.getBoundingClientRect().height) : null,
        triggerRadius: trigger ? getComputedStyle(trigger).borderTopLeftRadius : null,
        exportWidth: exportBtn ? Math.round(exportBtn.getBoundingClientRect().width) : null,
        exportHeight: exportBtn ? Math.round(exportBtn.getBoundingClientRect().height) : null,
        exportLabelVisible: exportBtn
          ? getComputedStyle(exportBtn.querySelector('.export-btn__label')).display !== 'none'
          : null,
        railOverflow: rails.map((rail) => rail.scrollWidth > rail.clientWidth + 1),
      }
    })
  })

  const docOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))

  console.log(`\n=== viewport ${vp.name} ===`)
  console.log('overflow doc:', docOverflow)
  console.log(JSON.stringify(report, null, 2))
}

await browser.close()
