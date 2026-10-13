// QA visual del flujo de medios de pago por evento (Storybook en :6006).
import { chromium } from 'playwright'

const BASE = 'http://localhost:6017/iframe.html'
const OUT = process.argv[2]

const platform = {
  checkoutEnabled: true,
  membershipEnabled: true,
  registrationEnabled: true,
  ticketEnabled: true,
  paymentChannels: {
    membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: false, wise_transfer: false },
  },
}

const browser = await chromium.launch()
const shots = [
  { id: 'admin-admineventquickcreate--default', name: 'quick', full: true },
  { id: 'admin-admineventquickcreate--duplicando', name: 'quick-dup', full: true },
  { id: 'admin-eventssection--default', name: 'list', full: false },
]
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const theme of ['light', 'dark']) {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.route('**/api/platform-settings', (route) =>
      route.fulfill({ json: platform }),
    )
    await page.route('**/api/payment-profiles**', (route) =>
      route.fulfill({
        json: {
          profiles: [
            { id: '7d9f0c9e-3a2b-4c1d-8e5f-0a1b2c3d4e5f', name: 'Cuenta del club', kind: 'bank_transfer', config: { alias: 'club.pesas' } },
          ],
          secretsKeyConfigured: true,
        },
      }),
    )
    for (const shot of shots) {
      await page.goto(`${BASE}?id=${shot.id}&viewMode=story&globals=theme:${theme}`)
      await page.waitForTimeout(1800)
      const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      if (shot.name === 'quick') {
        // Abre la transferencia en inscripción para ver el selector de perfil.
        const box = page.getByRole('checkbox', { name: /transferencia · inscripción/i })
        if (await box.count()) await box.first().check().catch(() => {})
        await page.waitForTimeout(500)
      }
      const file = `${OUT}/${shot.name}-${vp.name}-${theme}.png`
      await page.screenshot({ path: file, fullPage: shot.full })
      console.log(file, 'theme=', attr)
    }
    await context.close()
  }
}
await browser.close()
