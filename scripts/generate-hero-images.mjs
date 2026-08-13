#!/usr/bin/env node
/**
 * Genera variantes AVIF/WebP responsive de las fotos grandes de la landing
 * y de Pitbull Classic a partir de sus masters ya recortados (*-display.jpg).
 * No re-recorta ni re-compone ninguna imagen — solo reduce peso/formato.
 *
 * Uso: node scripts/generate-hero-images.mjs
 */
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = join(__dirname, '..', 'src', 'assets')

// Landscape (hero de Home, 2048×1153): full-bleed, necesita anchos grandes.
// Portrait (galería de Pitbull, 1153×2048 nativo): se usan en paneles/cards
// más chicos, así que alcanza con anchos menores.
const SOURCES = [
  { name: 'DSC00346-display', widths: [640, 1280, 2048] },
  { name: 'DSC00286-display', widths: [480, 800, 1153] },
  { name: 'DSC01606-display', widths: [480, 800, 1153] },
  { name: 'DSC00392-display', widths: [480, 800, 1153] },
]

async function run() {
  for (const { name, widths } of SOURCES) {
    const source = join(ASSETS_DIR, `${name}.jpg`)
    if (!existsSync(source)) {
      console.error(`✗ No se encontró el master: ${source}`)
      process.exitCode = 1
      continue
    }

    const maxWidth = Math.max(...widths)
    for (const width of widths) {
      const suffix = width === maxWidth ? '' : `-${width}`
      const base = sharp(source).resize({ width, withoutEnlargement: true })

      const avifPath = join(ASSETS_DIR, `${name}${suffix}.avif`)
      const webpPath = join(ASSETS_DIR, `${name}${suffix}.webp`)

      await base.clone().avif({ quality: 52 }).toFile(avifPath)
      await base.clone().webp({ quality: 74 }).toFile(webpPath)

      console.log(`✓ ${name} ${width}w → ${avifPath.split(/[\\/]/).pop()}, ${webpPath.split(/[\\/]/).pop()}`)
    }
  }
}

run().catch((err) => {
  console.error('Error generando variantes:', err)
  process.exitCode = 1
})
