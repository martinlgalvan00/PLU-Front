// Sonda temporal de auditoría visual (gitignorada por el punto inicial).
// Reproduce el bloque de decisión de afiliación con las clases reales sobre una
// story que ya carga `account.css`, sumando la hoja del desk de cobro.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.PROBE_URL ?? 'http://localhost:6006'
const STORY = 'pages-account-personaldatasection--default'
const OUT = 'scripts/.membership-probe-output'
mkdirSync(OUT, { recursive: true })

const MARKUP = `
  <div style="padding:32px 24px;background:var(--color-bg-primary)">
    <div class="account-membership__decision account-membership__decision--solo">
      <ul class="account-benefits account-benefits--inline" aria-label="Incluye">
        <li>Credencial digital</li>
        <li>Código de afiliado</li>
        <li>Acceso a eventos oficiales</li>
      </ul>
      <div class="account-membership__checkout">
        <button type="button" class="account-membership__settle-back">Volver a Mercado Pago</button>
        <div class="account-membership__billing">
          <div class="account-membership__billing-head">
            <span class="account-membership__billing-label">Modalidad</span>
            <p class="account-membership__billing-hint">Elegí cómo querés pagar la afiliación anual.</p>
          </div>
        </div>
        <div class="account-discount">
          <button type="button" class="account-discount__toggle">Tengo un código de descuento</button>
        </div>
        <div class="plu-checkout">
          <fieldset class="plu-checkout__methods">
            <legend>Cómo pagás</legend>
            <div class="plu-checkout__pills" role="radiogroup">
              <label class="plu-checkout__pill is-selected"><span class="plu-checkout__pill-label">Mercado Pago</span></label>
            </div>
          </fieldset>
          <div class="plu-checkout__bar account-membership__bar">
            <div class="plu-checkout__summary">
              <div class="plu-checkout__total">
                <span>Total</span>
                <strong>$ 75.000</strong>
              </div>
            </div>
            <button type="button" class="btn plu-checkout__submit">Continuar el pago</button>
          </div>
        </div>
      </div>
    </div>
  </div>`

const browser = await chromium.launch()

for (const testCase of [
  { name: 'after-dark', theme: 'dark', width: 900 },
  { name: 'after-light', theme: 'light', width: 900 },
  { name: 'after-mobile', theme: 'dark', width: 390 },
]) {
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: 'networkidle' })

  // La hoja del desk la importa `CheckoutDesk.jsx`, que esta story no monta.
  await page.evaluate(() => import('/src/styles/components/checkout-desk.css'))
  await page.waitForTimeout(500)

  const report = await page.evaluate(({ markup, activeTheme }) => {
    document.documentElement.setAttribute('data-theme', activeTheme)
    document.body.innerHTML = markup
    const measure = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        fontSize: style.fontSize,
        color: style.color,
      }
    }
    const back = document.querySelector('.account-membership__settle-back')
    const total = document.querySelector('.plu-checkout__total')
    const label = total.querySelector('span').getBoundingClientRect()
    const amount = total.querySelector('strong').getBoundingClientRect()

    return {
      backButton: measure('.account-membership__settle-back'),
      backLeft: Math.round(back.getBoundingClientRect().left),
      amount: measure('.plu-checkout__total strong'),
      submit: measure('.plu-checkout__submit'),
      labelAboveAmount: Math.round(amount.top - label.bottom) >= 0,
      sameLeftEdge: Math.round(amount.left) === Math.round(label.left),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }
  }, { markup: MARKUP, activeTheme: testCase.theme })

  console.log(JSON.stringify({ case: testCase.name, ...report, errors }, null, 2))
  await page.locator('.account-membership__decision').screenshot({
    path: `${OUT}/${testCase.name}.png`,
  })
  await context.close()
}

await browser.close()
