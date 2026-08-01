/**
 * Verificación puntual del nav mobile: mide el cluster del header (switch ES/EN
 * y CTA Afiliar) y el reparto de alto del drawer entre cabecera, scroll y footer,
 * en dark y light. Sirve para confirmar en el render real que las reglas de
 * institutional-shell.css ganan sobre las de components/states.css.
 *
 * Uso: node scripts/check-nav-cluster.mjs [url]
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5175/'
const VIEWPORT = { width: 390, height: 844 }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VIEWPORT })

await page.goto(url, { waitUntil: 'networkidle' })

for (const theme of ['dark', 'light']) {
  await page.evaluate((value) => {
    document.documentElement.setAttribute('data-theme', value)
  }, theme)
  await page.waitForTimeout(300)

  const cluster = await page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        background: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
      }
    }

    const thumb = document.querySelector('.plu-global-nav__mobile-cluster .locale-switch__segment-thumb')

    return {
      switch: read('.plu-global-nav__mobile-cluster .locale-switch--segment'),
      thumbDisplay: thumb ? getComputedStyle(thumb).display : 'ausente',
      affiliate: read('.plu-global-nav__mobile-affiliate'),
    }
  })

  console.log(`\n=== ${theme} · cluster header ===`)
  console.log(JSON.stringify(cluster, null, 2))

  await page.screenshot({
    path: `nav-cluster-${theme}.png`,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: 70 },
  })

  await page.click('.plu-global-nav__menu-button')
  await page.waitForSelector('#plu-mobile-drawer')
  await page.waitForTimeout(600)

  const drawer = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector)
      return node ? Math.round(node.getBoundingClientRect().height) : null
    }

    const footer = document.querySelector('.plu-drawer__footer')
    const footerStyle = footer ? getComputedStyle(footer) : null
    const scroll = document.querySelector('.plu-drawer__scroll')

    return {
      drawer: rect('.plu-drawer'),
      head: rect('.plu-drawer__head'),
      scroll: rect('.plu-drawer__scroll'),
      footer: rect('.plu-drawer__footer'),
      footerColumns: footerStyle?.gridTemplateColumns ?? null,
      footerRows: footerStyle?.gridTemplateRows ?? null,
      scrollOverflows: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
    }
  })

  console.log(`=== ${theme} · drawer ===`)
  console.log(JSON.stringify(drawer, null, 2))

  await page.screenshot({ path: `nav-drawer-${theme}.png` })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

await browser.close()
