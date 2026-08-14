import { chromium } from 'playwright'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'register-shots')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5173'
const url = (theme) =>
  `${BASE}/tmp/register-preview.html?flow=competition&theme=${theme}&filled=1&pm=manual_link`

const browser = await chromium.launch()
const problems = []

// 1) Reduced motion: nada puede quedar invisible sin scroll.
for (const width of [390, 703, 1440]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(() => localStorage.setItem('plu-arg-theme', 'dark'))
  const page = await ctx.newPage()
  await page.goto(url('dark'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const hidden = await page.evaluate(() => {
    const targets = [
      '.season-combo-offer__amount',
      '.plu-checkout__offer-price',
      '.register-competition-choice .field__choice-text',
      '.plu-checkout__submit',
    ]
    const out = []
    for (const selector of targets) {
      for (const el of document.querySelectorAll(selector)) {
        const style = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        if (Number(style.opacity) < 0.9 || rect.width === 0) {
          out.push(`${selector} opacity=${style.opacity} w=${Math.round(rect.width)}`)
        }
      }
    }
    return out
  })
  if (hidden.length) problems.push(`[reduced-motion ${width}] invisible: ${hidden.join(' | ')}`)

  await page.screenshot({ path: path.join(OUT, `competition-${width}-reduced.png`), fullPage: true })
  await ctx.close()
}

// 2) Foco de teclado visible en los controles de la pantalla.
{
  const ctx = await browser.newContext({ viewport: { width: 703, height: 900 }, colorScheme: 'dark' })
  await ctx.addInitScript(() => localStorage.setItem('plu-arg-theme', 'dark'))
  const page = await ctx.newPage()
  await page.goto(url('dark'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const focusable = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('input, button, select, a[href], [tabindex]')]
    return nodes.filter((el) => !el.disabled && el.offsetParent !== null).length
  })

  const ring = []
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab')
    // Los bordes de foco tienen transición de 180ms: sin esperar se lee un
    // color interpolado y parece que no hay indicador.
    await page.waitForTimeout(260)
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      const owner = el.closest('.field__choice, .plu-checkout__pill, .plu-checkout__offer')
      const ownerStyle = owner ? getComputedStyle(owner) : null
      const shadowed = (s) => s && s.boxShadow && s.boxShadow !== 'none'
      const outlined = (s) => s && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
      return {
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute('name') ?? el.textContent?.trim().slice(0, 24) ?? '',
        outline: outlined(style) ? `${style.outlineWidth} ${style.outlineColor}` : null,
        selfShadow: shadowed(style) ? style.boxShadow.slice(0, 40) : null,
        selfBorder: style.borderBottomColor,
        ownerOutline: outlined(ownerStyle) ? ownerStyle.outlineWidth : null,
        ownerShadow: shadowed(ownerStyle) ? ownerStyle.boxShadow.slice(0, 40) : null,
        ownerBorder: ownerStyle ? ownerStyle.borderLeftColor : null,
      }
    })
    if (info) ring.push(info)
  }
  console.log(`focusables visibles: ${focusable}`)
  console.log(JSON.stringify(ring, null, 2))

  const noRing = ring.filter(
    (item) => !item.outline && !item.ownerOutline && !item.selfShadow && !item.ownerShadow,
  )
  if (noRing.length) {
    problems.push(`[foco] sin anillo visible: ${noRing.map((i) => `${i.tag}/${i.name}`).join(', ')}`)
  }
  await ctx.close()
}

await browser.close()

console.log('\n--- QA ---')
if (problems.length) problems.forEach((p) => console.log('FALLA:', p))
else console.log('Sin fallas de reduced motion ni de foco.')
