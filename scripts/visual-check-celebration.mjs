#!/usr/bin/env node
/**
 * Visual QA del flujo de felicitación: sello, ráfaga de papel y acuses.
 *
 * Uso:
 *   1. En una terminal: npm run storybook   (deja Storybook en :6006)
 *   2. En otra terminal: npm run visual-check:celebration
 *
 * Variables opcionales:
 *   CELEBRATION_CHECK_URL   base URL de Storybook (default http://localhost:6006)
 *
 * Qué valida, en 360 / 390 / 768 / 900 / 1440 / 1920, light y dark:
 *   - La ráfaga se monta por portal en <body> y no dentro del componente. Sin
 *     el portal, un ancestro con `transform` de Motion o `backdrop-filter` la
 *     captura y sale desplazada del sello.
 *   - Una sola ráfaga por momento. `RegisterPage` monta el bloque de
 *     confirmación dos veces —aside de desktop y contexto mobile, uno apagado
 *     por `display: none`—, así que sin el guard de visibilidad salían dos.
 *   - El acuse de inscripción confirmada se ve en todas las resoluciones. En
 *     mobile vivía detrás de `.register-page--settling-mp`, que oculta el
 *     contexto mobile para dejarle la pantalla al brick de Mercado Pago:
 *     correcto mientras se paga, pero dejaba al atleta sin festejo ni botón de
 *     card una vez confirmado.
 *   - Cero overflow horizontal: la capa es fija con overflow oculto.
 *   - La ráfaga se desmonta sola al terminar (no quedan 30 nodos en el árbol).
 *   - Bajo `prefers-reduced-motion` no se monta un solo nodo y el acuse en
 *     texto queda completo.
 *   - El acuse de credencial emitida aparece una vez y no vuelve en la
 *     siguiente visita.
 *
 * Salida: screenshots en scripts/.visual-check-output/celebration/ (gitignored)
 * y un resumen en consola. Exit code 1 si algo falla.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '.visual-check-output', 'celebration')
mkdirSync(OUT_DIR, { recursive: true })

const BASE_URL = process.env.CELEBRATION_CHECK_URL ?? 'http://localhost:6006'

const VIEWPORTS = [
  { name: '360', width: 360, height: 900 },
  { name: '390', width: 390, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '900', width: 900, height: 1000 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]

/** Cerca del apex del arco: sello estampado (560 ms) + ~46% del vuelo. */
const AT_APEX_MS = 1100
/** Después de que la ráfaga terminó y se desmontó. */
const AFTER_FLIGHT_MS = 1500

const MOMENTS = [
  {
    label: 'afiliacion',
    id: 'ui-registermembershipconfirmation--activa-con-card',
    sealSelector: '.confirmation-seal--membership',
  },
  {
    label: 'inscripcion',
    id: 'pages-registro-flujos-de-checkout--inscripcion-confirmada',
    sealSelector: '.confirmation-seal--registration',
  },
  {
    label: 'credencial',
    id: 'cuenta-qrcredentialsection--credencial-emitida',
    sealSelector: '.account-qr__issued-seal',
    // El acuse de emisión es de "una sola vez": sin limpiar el storage la
    // segunda corrida no festejaría y la captura no probaría nada.
    clearStorage: true,
  },
]

const failures = []
const notes = []

function fail(message) {
  failures.push(message)
  console.error(`x ${message}`)
}

function note(message) {
  notes.push(message)
  console.log(`. ${message}`)
}

function storyUrl(id, theme) {
  return `${BASE_URL}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`
}

/**
 * Ruido esperado del preview, no fallas del flujo:
 *   - Chromium loguea la política de gesto de usuario de `navigator.vibrate`
 *     aunque haptics.js la capture.
 *   - Storybook monta las pantallas sin backend, así que el chequeo de tanda
 *     privada 404ea a propósito.
 */
function isExpectedNoise(text) {
  return text.includes('navigator.vibrate') || text.includes('Failed to load resource')
}

async function openStory(browser, { id, theme, viewport, reducedMotion = false, clearStorage }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  if (clearStorage) {
    await context.addInitScript(() => {
      try {
        localStorage.clear()
      } catch {
        // Modo privado: no hay nada que limpiar.
      }
    })
  }
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (isExpectedNoise(message.text())) return
    errors.push(message.text())
  })
  await page.goto(storyUrl(id, theme), { waitUntil: 'networkidle' })
  return { context, page, errors }
}

function inspect(sealSelector) {
  const seals = [...document.querySelectorAll(sealSelector)]
  const burst = document.querySelector('.celebration-burst')
  const root = document.documentElement
  return {
    sealsInDom: seals.length,
    visibleSeals: seals.filter((seal) => seal.getBoundingClientRect().width > 0).length,
    bursts: document.querySelectorAll('.celebration-burst').length,
    pieces: document.querySelectorAll('.celebration-burst__piece').length,
    burstParentIsBody: burst ? burst.parentElement === document.body : null,
    overflowX: root.scrollWidth - root.clientWidth,
    bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
  }
}

const browser = await chromium.launch()

try {
  for (const moment of MOMENTS) {
    for (const theme of ['dark', 'light']) {
      for (const viewport of VIEWPORTS) {
        const scope = `${moment.label} ${theme} ${viewport.name}`
        const { context, page, errors } = await openStory(browser, {
          id: moment.id,
          theme,
          viewport,
          clearStorage: moment.clearStorage,
        })

        await page.waitForTimeout(AT_APEX_MS)
        const info = await page.evaluate(inspect, moment.sealSelector)
        await page.screenshot({
          path: join(OUT_DIR, `${moment.label}-${theme}-${viewport.name}.png`),
        })

        // Un solo sello a la vista: el bloque puede estar montado dos veces,
        // pero la persona ve uno y el papel sale de ese.
        if (info.visibleSeals !== 1) {
          fail(`${scope}: sellos visibles ${info.visibleSeals}, esperado 1`)
        }
        if (info.bursts === 0) fail(`${scope}: no hubo rafaga`)
        if (info.bursts > 1) fail(`${scope}: ${info.bursts} rafagas simultaneas`)
        if (info.bursts > 0 && !info.burstParentIsBody) {
          fail(`${scope}: la rafaga no se monto por portal en body`)
        }
        if (info.overflowX > 1 || info.bodyOverflowX > 1) {
          fail(`${scope}: overflow horizontal ${info.overflowX}/${info.bodyOverflowX}`)
        }

        await page.waitForTimeout(AFTER_FLIGHT_MS)
        const settled = await page.evaluate(
          () => document.querySelectorAll('.celebration-burst').length,
        )
        if (settled > 0) fail(`${scope}: la rafaga no se desmonto`)

        if (errors.length) fail(`${scope}: consola ${errors.join(' | ')}`)
        else note(`${scope}: piezas=${info.pieces} overflow=${info.overflowX}`)

        await context.close()
      }
    }
  }

  // Reduced motion: la puerta es shouldCelebrate, no un @media. No se monta un
  // solo nodo del papel, y el acuse en texto sigue completo.
  for (const moment of MOMENTS) {
    const { context, page, errors } = await openStory(browser, {
      id: moment.id,
      theme: 'dark',
      viewport: { width: 390, height: 900 },
      reducedMotion: true,
      clearStorage: moment.clearStorage,
    })
    await page.waitForTimeout(AFTER_FLIGHT_MS)
    const info = await page.evaluate(inspect, moment.sealSelector)
    await page.screenshot({ path: join(OUT_DIR, `${moment.label}-reduced-390.png`) })

    if (info.bursts > 0) fail(`${moment.label} reduced-motion: se monto la rafaga`)
    if (info.visibleSeals !== 1) {
      fail(`${moment.label} reduced-motion: el acuse en texto no quedo completo`)
    }
    if (errors.length) fail(`${moment.label} reduced-motion: consola ${errors.join(' | ')}`)
    else note(`${moment.label} reduced-motion: sin papel, acuse presente`)
    await context.close()
  }

  // El acuse de credencial emitida es de una sola vez: en la segunda visita la
  // seccion se lee sin ceremonia, que es lo correcto a partir de ahi.
  {
    const credential = MOMENTS.find((moment) => moment.label === 'credencial')
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
    const page = await context.newPage()
    await page.goto(storyUrl(credential.id, 'dark'), { waitUntil: 'networkidle' })
    await page.waitForTimeout(AFTER_FLIGHT_MS)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(AFTER_FLIGHT_MS)
    const again = await page.evaluate(inspect, credential.sealSelector)
    await page.screenshot({ path: join(OUT_DIR, 'credencial-segunda-visita.png') })

    if (again.visibleSeals > 0 || again.bursts > 0) {
      fail('credencial: el acuse de emision volvio a aparecer en la segunda visita')
    } else {
      note('credencial: la segunda visita no repite el acuse')
    }
    await context.close()
  }
} finally {
  await browser.close()
}

console.log('')
console.log(`${notes.length} comprobaciones registradas. Capturas en ${OUT_DIR}`)
if (failures.length) {
  console.error(`\n${failures.length} fallas:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('OK: sin fallas')
