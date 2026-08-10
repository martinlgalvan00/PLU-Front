#!/usr/bin/env node
/**
 * render-share-card-previews.mjs — PLU ARG
 *
 * Genera PNGs reales de EventShareCard en docs/share-card-previews/ usando
 * el MISMO pipeline de producción (html2canvas vía eventCardService), más un
 * index.html para revisar todas las variantes de un vistazo en el navegador.
 * Sirve para perfeccionar el diseño sin levantar la app ni loguearse.
 *
 * Uso:
 *   npm run share-cards:previews
 *
 * Levanta un dev server de Vite propio (puerto 5199) que monta
 * scripts/share-card-preview/index.html, captura cada fixture con Playwright
 * y lo apaga al terminar. Los QRs apuntan al origin local del preview — en
 * producción apuntan al dominio real (mismo componente, mismo generador).
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'docs', 'share-card-previews')
const PORT = Number(process.env.SHARE_CARD_PREVIEW_PORT ?? 5199)
const PREVIEW_URL = `http://localhost:${PORT}/scripts/share-card-preview/index.html`

mkdirSync(OUT_DIR, { recursive: true })

function startVite() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  return child
}

function stopVite(child) {
  if (!child || child.killed) return
  // En Windows, matar el shell no mata al proceso de vite hijo — taskkill /T
  // se lleva el árbol completo.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

async function isServerUp(url) {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now()
  for (;;) {
    if (await isServerUp(url)) return
    if (Date.now() - start > timeoutMs) {
      throw new Error(`El dev server no respondió en ${timeoutMs}ms (${url})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

function buildIndexHtml(entries) {
  const figures = entries
    .map(
      ({ name, width, height }) => `      <figure>
        <a href="${name}.png" target="_blank" rel="noopener">
          <img src="${name}.png" alt="${name}" loading="lazy" />
        </a>
        <figcaption><strong>${name}</strong><span>${width}×${height} PNG</span></figcaption>
      </figure>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Share cards — previews de diseño · PLU ARG</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #101114;
        color: rgba(255, 255, 255, 0.75);
        font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif;
        padding: 48px 32px 96px;
      }
      header { max-width: 1200px; margin: 0 auto 40px; }
      h1 { color: #fff; font-size: 22px; font-weight: 700; margin: 0 0 8px; }
      header p { margin: 0; font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.5); }
      code { color: #f2b705; }
      .grid {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 32px;
        align-items: start;
      }
      figure { margin: 0; }
      figure img {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 6px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      }
      figcaption {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 10px;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      figcaption strong { color: rgba(255,255,255,0.85); font-weight: 600; }
      figcaption span { color: rgba(255,255,255,0.35); }
      footer { max-width: 1200px; margin: 56px auto 0; font-size: 12px; color: rgba(255,255,255,0.35); }
    </style>
  </head>
  <body>
    <header>
      <h1>Share cards — previews de diseño</h1>
      <p>
        PNGs reales generados con el pipeline de producción (html2canvas).
        Regenerar con <code>npm run share-cards:previews</code>.
        Click en cualquier imagen para verla a tamaño completo.
      </p>
    </header>
    <div class="grid">
${figures}
    </div>
    <footer>
      Generado por scripts/render-share-card-previews.mjs — componente:
      src/components/ui/EventShareCard.jsx + src/styles/components/event-share-card.css
    </footer>
  </body>
</html>
`
}

async function run() {
  // Si ya hay un dev server del proyecto en el puerto, se reusa tal cual —
  // la página de preview es parte del repo y cualquier vite del root la sirve.
  const reuseExisting = await isServerUp(PREVIEW_URL)
  let server = null
  if (reuseExisting) {
    console.log(`Reusando el dev server que ya corre en :${PORT}…`)
  } else {
    console.log(`Levantando dev server de preview en :${PORT}…`)
    server = startVite()
    await waitForServer(PREVIEW_URL)
  }

  let browser
  try {
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
    page.on('pageerror', (err) => console.error(`✗ Error en página de preview: ${err.message}`))

    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const expectedQrs = await page.evaluate(() => window.__shareCardPreview?.expectedQrs ?? 0)
    await page.waitForFunction(
      (expected) => document.querySelectorAll('.share-card__qr-img').length >= expected,
      expectedQrs,
      { timeout: 20000 },
    )
    // Margen extra para que el paint de la fuente y el QR se asienten.
    await page.waitForTimeout(600)

    console.log('Capturando con html2canvas (pipeline de producción)…')
    const results = await page.evaluate(() => window.__shareCardPreview.captureAll())

    const entries = []
    for (const { name, dataUrl } of results) {
      const base64 = dataUrl.split(',')[1]
      const buffer = Buffer.from(base64, 'base64')
      writeFileSync(join(OUT_DIR, `${name}.png`), buffer)
      const dims = await page.evaluate(async (data) => {
        const img = new Image()
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = data
        })
        return { width: img.naturalWidth, height: img.naturalHeight }
      }, dataUrl)
      console.log(`  ✓ ${name}.png  ${dims.width}×${dims.height}  ${(buffer.length / 1024).toFixed(0)} KB`)
      entries.push({ name, ...dims })
    }

    writeFileSync(join(OUT_DIR, 'index.html'), buildIndexHtml(entries), 'utf8')
    console.log(`\n${entries.length} previews en docs/share-card-previews/`)
    console.log(`Índice: docs/share-card-previews/index.html`)
  } finally {
    if (browser) await browser.close()
    if (server) stopVite(server)
  }
}

run().catch((err) => {
  console.error(`\n✗ ${err.message}`)
  process.exitCode = 1
})
