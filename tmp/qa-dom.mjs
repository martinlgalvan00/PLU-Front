import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await page.route('**/api/platform-settings', (r) => r.fulfill({ json: { checkoutEnabled: true, paymentChannels: {} } }))
await page.goto('http://localhost:6017/iframe.html?id=admin-eventssection--default&viewMode=story&globals=theme:light')
page.on('console', (m) => m.type()==='error' && console.log('ERR', m.text().slice(0,200))); await page.waitForSelector('.admin-event-row', { timeout: 15000 }).catch(() => console.log('no row'))
const info = await page.evaluate(() => {
  const row = document.querySelector('.admin-event-row')
  const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  const body = row.querySelector('.admin-event-row__body')
  return {
    bodyDisplay: getComputedStyle(body).display,
    mainDisplay: getComputedStyle(row.querySelector('.admin-event-row__main')).display,
    body: rect(body), title: rect(row.querySelector('.admin-event-row__title')),
    meta: rect(row.querySelector('.admin-event-row__meta')), pay: rect(row.querySelector('.admin-event-row__pay')),
    html: body.outerHTML.slice(0, 600),
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
