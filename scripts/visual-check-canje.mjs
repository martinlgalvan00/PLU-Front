#!/usr/bin/env node
/**
 * Visual QA del canje de códigos: los cuatro momentos y su motion.
 *
 * Uso:
 *   1. En una terminal: npm run storybook   (deja Storybook en :6006)
 *   2. En otra terminal: npm run visual-check:canje
 *
 * Variables opcionales:
 *   CANJE_CHECK_URL   base URL de Storybook (default http://localhost:6006)
 *
 * Por qué lee `getAnimations()` y no compara pixeles: una animación no se puede
 * auditar por captura —el frame que sale depende de cuándo disparó el
 * screenshot—, y lo que hay que proteger no es un fotograma sino el contrato:
 * qué animación corre, sobre qué pseudo-elemento, y con cuántas iteraciones.
 *
 * Qué valida, en 1440 y 390, light y dark, con y sin `prefers-reduced-motion`:
 *   - `checking`: el barrido de luz corre en `.code-band::after` y es el ÚNICO
 *     loop de la pieza —nace con la espera y muere con ella—, más el spinner del
 *     chip. El chip queda cuadrado (44px) para devolverle el ancho al código:
 *     con la palabra "Validando" puesta, un código largo quedaba cortado a
 *     media palabra justo cuando el atleta quiere leer la llave que mandó.
 *   - `accepted` / `applied`: el aro (`code-band-seal`) y el barrido
 *     (`code-band-sweep`) corren una vez cada uno y no queda ningún loop.
 *     El barrido del sello tiene nombre propio a propósito: cuando la lista de
 *     `animation-name` no cambia el navegador ACTUALIZA la animación en curso en
 *     vez de reiniciarla, así que reusar `code-band-scan` con otra duración hacía
 *     que viniendo de `checking` el sello apareciera ya terminado.
 *   - `error`: el desplazamiento amortiguado corre una vez, y el filo pasa a
 *     rojo en los DOS temas (en light `[data-theme='light'] .code-band` le ganaba
 *     por especificidad a `.code-band--error` y el rechazo no se pintaba).
 *   - El reveal abre por el titular y no scrolleado hasta los botones: el panel
 *     es el contenedor scrolleable, y enfocar un control de abajo lo arrastraba
 *     —en 390px la pieza abría sin titular, sin código y sin condiciones—.
 *   - El reveal cierra con salida animada y el foco arranca en el panel, sin
 *     anillo celeste sobre el chip de oro.
 *   - La recotización está enganchada en la barra de pago real.
 *   - La oferta que se destraba tiene su entrada declarada.
 *   - Cero overflow horizontal y cero errores de consola.
 *   - Con `prefers-reduced-motion` ninguna secuencia corre y nada queda oculto.
 *
 * Salida: screenshots en scripts/.visual-check-output/canje/ (gitignored) y un
 * resumen en consola. Exit code 1 si algo falla.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '.visual-check-output', 'canje')
mkdirSync(OUT_DIR, { recursive: true })

const BASE_URL = process.env.CANJE_CHECK_URL ?? 'http://localhost:6006'
const IFRAME = `${BASE_URL}/iframe.html`

const BREAKPOINTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
]

const STORY = {
  validando: 'cuenta-secretoffercoderedeemer--validando',
  rechazada: 'cuenta-secretoffercoderedeemer--llave-rechazada',
  aceptado: 'cuenta-secretoffercoderedeemer--canje-aceptado',
  registro: 'cuenta-secretoffercoderedeemer--registro-en-la-banda',
  reveal: 'cuenta-promotionrevealmodal--precio-pactado-con-plazo',
  checkout: 'pages-registro-flujos-de-checkout--inscripcion',
}

const failures = []
const passes = []
const notes = []

function fail(message) {
  failures.push(message)
  console.error(`✗ ${message}`)
}

function pass(message) {
  passes.push(message)
  console.log(`✓ ${message}`)
}

function note(message) {
  notes.push(message)
  console.log(`· ${message}`)
}

/** Animaciones que corren sobre un elemento y sus descendientes, con pseudos. */
function runningAnimations(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return null
    return document
      .getAnimations()
      .filter((animation) => {
        const target = animation.effect?.target
        return target === root || (target && root.contains(target))
      })
      .map((animation) => ({
        name: animation.animationName ?? animation.transitionProperty ?? '?',
        pseudo: animation.effect?.pseudoElement ?? null,
        iterations: animation.effect?.getTiming?.().iterations ?? null,
      }))
  }, selector)
}

async function auditBand(page, label, storyId, state, expected, { reduced, shot }) {
  await page.waitForSelector(`.code-band[data-state="${state}"]`, { timeout: 8000 }).catch(() => {})
  const running = await runningAnimations(page, '.code-band')
  await page.screenshot({ path: join(OUT_DIR, `${shot}.png`) })

  if (running === null) {
    fail(`[${label}] ${storyId}: no se montó ninguna .code-band`)
    return null
  }

  const own = running.filter((animation) => String(animation.name).startsWith('code-band'))

  if (reduced) {
    if (own.length) {
      fail(`[${label}] ${state}: con reduced motion corre ${own.map((a) => a.name).join(', ')}`)
    } else {
      pass(`[${label}] ${state}: sin animación bajo reduced motion`)
    }
    return running
  }

  for (const want of expected) {
    const found = own.find((animation) => animation.name === want.name)
    if (!found) {
      fail(
        `[${label}] ${state}: falta ${want.name} (corre ${own.map((a) => a.name).join() || '—'})`,
      )
      continue
    }
    if (want.pseudo && found.pseudo !== want.pseudo) {
      fail(`[${label}] ${state}: ${want.name} no está en ${want.pseudo} (${found.pseudo})`)
      continue
    }
    if (want.loop === true && found.iterations !== Infinity) {
      fail(`[${label}] ${state}: ${want.name} tendría que ser loop (${found.iterations})`)
      continue
    }
    if (want.loop === false && found.iterations === Infinity) {
      fail(`[${label}] ${state}: ${want.name} quedó en loop`)
      continue
    }
    pass(`[${label}] ${state}: ${want.name}${want.pseudo ? ` en ${want.pseudo}` : ''}`)
  }

  return running
}

async function main() {
  const browser = await chromium.launch()

  for (const viewport of BREAKPOINTS) {
    for (const theme of ['dark', 'light']) {
      for (const reduced of [false, true]) {
        const label = `${viewport.name}/${theme}${reduced ? '/reduced' : ''}`
        const suffix = `${viewport.name}__${theme}${reduced ? '__reduced' : ''}`
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: reduced ? 'reduce' : 'no-preference',
        })
        const page = await context.newPage()
        const consoleErrors = []
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160))
        })
        page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

        const goto = async (storyId, settleMs = 1800) => {
          await page.goto(`${IFRAME}?id=${storyId}&globals=theme:${theme}&viewMode=story`, {
            waitUntil: 'load',
          })
          // Las `play` de estas historias tipean y esperan una respuesta stub.
          await page.waitForTimeout(settleMs)
        }

        const noOverflow = async (where) => {
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          )
          if (overflow) fail(`[${label}] ${where}: overflow horizontal`)
        }

        // ── 1. Validando ────────────────────────────────────────────────────
        await goto(STORY.validando)
        await auditBand(
          page,
          label,
          STORY.validando,
          'checking',
          [
            { name: 'code-band-scan', pseudo: '::after', loop: true },
            { name: 'code-band-spin', loop: true },
          ],
          { reduced, shot: `validando__${suffix}` },
        )
        await noOverflow('validando')

        // Mandada la llave el código deja de ser un campo y pasa a ser registro:
        // un `<input>` no envuelve, y en 390px al código largo le faltaban 141px
        // de ancho. El chip cuadrado le suma los ~120px que la palabra
        // "Validando" le sacaba.
        const chip = await page.evaluate(() => {
          const button = document.querySelector('.code-band__chip')
          const record = document.querySelector('.code-band__code')
          const field = document.querySelector('.code-band__input')
          if (!button) return null
          return {
            chipWidth: Math.round(button.getBoundingClientRect().width),
            chipText: button.textContent.trim(),
            hasRecord: Boolean(record),
            hasField: Boolean(field),
            code: record?.textContent ?? '',
            clipped: record ? record.scrollWidth > record.clientWidth + 1 : null,
          }
        })
        if (!chip) {
          fail(`[${label}] validando: no hay chip`)
        } else {
          if (chip.chipText !== '') {
            fail(`[${label}] validando: el chip todavía lleva texto ("${chip.chipText}")`)
          } else {
            pass(`[${label}] validando: chip sin texto, ${chip.chipWidth}px`)
          }
          if (!chip.hasRecord || chip.hasField) {
            fail(
              `[${label}] validando: el código sigue siendo un campo (registro ${chip.hasRecord}, input ${chip.hasField})`,
            )
          } else if (chip.clipped) {
            fail(`[${label}] validando: el código queda cortado (${chip.code})`)
          } else {
            pass(`[${label}] validando: el código se lee completo (${chip.code})`)
          }
        }

        // ── 2. Llave rechazada ──────────────────────────────────────────────
        await goto(STORY.rechazada)
        await auditBand(
          page,
          label,
          STORY.rechazada,
          'error',
          [{ name: 'code-band-reject', loop: false }],
          { reduced, shot: `rechazada__${suffix}` },
        )
        // El filo rojo tiene que pintarse en los DOS temas. El color se resuelve
        // con un canvas y no parseando el string: color-mix en oklab llega al
        // computed style como oklab(...), asi que leer los numeros y tratarlos
        // como RGB daba un falso negativo. El canvas pinta el color que el
        // navegador realmente usa y devuelve sus componentes.
        const edge = await page.evaluate(() => {
          const band = document.querySelector('.code-band')
          if (!band) return null
          const declared = getComputedStyle(band).borderTopColor
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext('2d')
          // Fondo blanco: el filo lleva alpha, y sobre transparente los
          // componentes vuelven premultiplicados y no se pueden comparar.
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, 1, 1)
          ctx.fillStyle = declared
          ctx.fillRect(0, 0, 1, 1)
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
          return { declared, r, g, b }
        })
        if (!edge) {
          fail(`[${label}] rechazada: no hay banda`)
        } else if (!(edge.r > edge.g + 20 && edge.r > edge.b + 20)) {
          fail(
            `[${label}] rechazada: el filo no se lee como rojo (${edge.declared} -> rgb(${edge.r},${edge.g},${edge.b}))`,
          )
        } else {
          pass(`[${label}] rechazada: filo rojo (rgb(${edge.r},${edge.g},${edge.b}))`)
        }

        // ── 3. Sello ────────────────────────────────────────────────────────
        await goto(STORY.aceptado)
        await auditBand(
          page,
          label,
          STORY.aceptado,
          'accepted',
          [
            { name: 'code-band-seal', pseudo: '::before', loop: false },
            { name: 'code-band-sweep', pseudo: '::after', loop: false },
            { name: 'code-band-stamp', loop: false },
          ],
          { reduced, shot: `sello__${suffix}` },
        )

        // Salida del reveal: se prueba acá y no en la historia del modal, que
        // tiene `onClose` no-op —existe para auditar la pieza, no su ciclo—.
        await page.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => {})
        await page.getByRole('button', { name: /lo uso despu/i }).click()
        const closing = await page.locator('.promotion-reveal__overlay.is-closing').count()
        if (reduced && closing) {
          fail(`[${label}] reveal: con reduced motion no debería animar la salida`)
        } else if (!reduced && !closing) {
          fail(`[${label}] reveal: la salida no se marcó`)
        } else {
          pass(`[${label}] reveal: ${reduced ? 'cierre inmediato' : 'salida animada'}`)
        }
        await page.waitForTimeout(500)
        if (await page.locator('[role="dialog"]').count()) {
          fail(`[${label}] reveal: quedó abierto después de descartar`)
        } else {
          pass(`[${label}] reveal: cerrado`)
        }

        // ── 4. El reveal abre por el titular ────────────────────────────────
        await goto(STORY.reveal)
        await noOverflow('reveal')
        const opening = await page.evaluate(() => {
          const panel = document.querySelector('.promotion-reveal')
          const headline = document.querySelector('.promotion-reveal__headline')
          if (!panel || !headline) return { missing: true }
          const panelBox = panel.getBoundingClientRect()
          const headBox = headline.getBoundingClientRect()
          return {
            scrollTop: panel.scrollTop,
            headlineVisible:
              headBox.top >= panelBox.top - 1 && headBox.bottom <= panelBox.bottom + 1,
            focused: document.activeElement?.className ?? '',
          }
        })
        await page.screenshot({ path: join(OUT_DIR, `reveal__${suffix}.png`) })
        if (opening.missing) fail(`[${label}] reveal: falta el panel o el titular`)
        else if (opening.scrollTop !== 0) {
          fail(`[${label}] reveal: abre scrolleado (scrollTop ${opening.scrollTop})`)
        } else if (!opening.headlineVisible) {
          fail(`[${label}] reveal: el titular no entra en el panel`)
        } else if (!String(opening.focused).includes('promotion-reveal')) {
          fail(`[${label}] reveal: el foco no arrancó en la pieza (${opening.focused})`)
        } else {
          pass(`[${label}] reveal: abre por el titular, foco en el panel`)
        }

        // ── 5. Registro: nada queda invisible después del settle ────────────
        await goto(STORY.registro)
        const record = await page.evaluate(() => {
          const resolved = document.querySelector('.secret-code-redeemer__resolved')
          if (!resolved) return 'no se montó el registro'
          return getComputedStyle(resolved).opacity === '0' ? 'quedó en opacity 0' : null
        })
        if (record) fail(`[${label}] registro: ${record}`)
        else pass(`[${label}] registro: visible después del settle`)
        await noOverflow('registro')
        await page.screenshot({ path: join(OUT_DIR, `registro__${suffix}.png`) })

        // ── 6. Barra de pago: recotización y entrada de la oferta ───────────
        // Este checkout resuelve disponibilidad contra la API antes de dibujar la
        // barra, y en Storybook esos pedidos van a 404: tarda mas en asentar.
        await goto(STORY.checkout, 3800)
        const checkout = await page.evaluate(() => {
          const total = document.querySelector('.plu-checkout__total strong')
          if (!total) return { missing: true }
          // La entrada de la oferta destrabada se prueba sobre un nodo de
          // sonda y no sobre una tarjeta viva, por dos razones: destrabarla pide
          // un codigo aplicado, que en Storybook no hay, y esta historia
          // ademas no monta ninguna tarjeta —tiene un solo tipo de
          // inscripcion—. La sonda comprueba lo que importa: que la regla
          // exista y matchee la clase que CheckoutDesk pone.
          const probe = document.createElement('div')
          probe.className = 'plu-checkout__offer is-unlocked'
          document.body.appendChild(probe)
          const unlockName = getComputedStyle(probe).animationName
          probe.remove()
          return {
            totalAnimation: getComputedStyle(total).animationName,
            unlockAnimation: unlockName,
          }
        })
        if (checkout.missing) {
          fail(`[${label}] checkout: no hay barra de pago`)
        } else if (reduced) {
          if (checkout.totalAnimation !== 'none' || checkout.unlockAnimation !== 'none') {
            fail(
              `[${label}] checkout: con reduced motion sigue animando (total ${checkout.totalAnimation}, oferta ${checkout.unlockAnimation})`,
            )
          } else {
            pass(`[${label}] checkout: sin animación bajo reduced motion`)
          }
        } else {
          if (checkout.totalAnimation !== 'checkout-total-settle') {
            fail(
              `[${label}] checkout: la recotización no está enganchada (${checkout.totalAnimation})`,
            )
          } else {
            pass(`[${label}] checkout: recotización enganchada`)
          }
          if (checkout.unlockAnimation !== 'checkout-offer-unlock') {
            fail(
              `[${label}] checkout: la oferta destrabada no tiene entrada (${checkout.unlockAnimation})`,
            )
          } else {
            pass(`[${label}] checkout: la oferta destrabada tiene entrada`)
          }
        }

        // Ausencia de backend no es un hallazgo acá. Las historias de checkout
        // piden a la API (disponibilidad, catalogo de gimnasios) y Storybook no
        // sirve /api, asi que salen 404 y el `catch(console.error)` del llamador
        // los loguea: es el camino degradado funcionando, no un error nuevo. Se
        // cuentan aparte para que el gate siga sirviendo para lo que importa,
        // que son los errores de JS.
        const NETWORK_NOISE = ['Failed to load resource', 'ApiError: Error 404']
        const isNoise = (line) => NETWORK_NOISE.some((pattern) => line.includes(pattern))
        const network = consoleErrors.filter(isNoise)
        const real = consoleErrors.filter((line) => !isNoise(line))
        if (network.length) note(`[${label}] ${network.length} pedidos sin backend (esperado)`)
        if (real.length) {
          fail(`[${label}] consola: ${real.slice(0, 3).join(' | ')}`)
        }

        await context.close()
      }
    }
  }

  await browser.close()

  console.log(`\n${passes.length} ok · ${notes.length} notas · ${failures.length} fallas`)
  console.log(`Capturas en ${OUT_DIR}`)
  if (failures.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
