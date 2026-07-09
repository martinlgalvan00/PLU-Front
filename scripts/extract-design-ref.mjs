import fs from 'node:fs'
import path from 'node:path'

const defaultFile = path.join(
  process.cwd(),
  'design-reference/PLU ARG - Sitio Publico (standalone).html',
)
const file = process.argv[2] ? path.resolve(process.argv[2]) : defaultFile

if (!fs.existsSync(file)) {
  console.error('No existe el archivo de diseño:', file)
  console.error('Usá: node scripts/extract-design-ref.mjs [ruta-al-html]')
  process.exit(1)
}

const raw = fs.readFileSync(file, 'utf8')

// Embedded design HTML is JSON-escaped on line ~180
const match = raw.match(/"<!DOCTYPE html>\\n[\s\S]*?"\s*,?\s*\n/)
let html = match ? match[0].slice(1, -3) : raw
html = html.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\u002F/g, '/')

const outPath = path.join(process.cwd(), 'design-reference/extracted-design.html')
fs.writeFileSync(outPath, html)
console.log('Fuente:', path.relative(process.cwd(), file))
console.log('Extraído:', path.relative(process.cwd(), outPath), `(${html.length} bytes)`)

const colors = [...new Set(html.match(/#[0-9a-fA-F]{3,8}/g) ?? [])].slice(0, 40)
console.log('Colores (muestra):', colors.join(', '))

const fonts = [...new Set([...(html.match(/font-family:\s*[^;}{]+/g) ?? [])].map((s) => s.trim()))].slice(0, 20)
console.log('Fuentes:\n ', fonts.join('\n  '))

const sections = [...html.matchAll(/<section[^>]*(?:id|style)[^>]*>/gi)]
console.log('Secciones encontradas:', sections.length)

const ids = [...html.matchAll(/<section[^>]*\bid="([^"]+)"/gi)].map((m) => m[1])
if (ids.length) {
  console.log('IDs de sección:', ids.join(', '))
}

const textSnippets = [...html.matchAll(/>([A-ZÁÉÍÓÚÑ¿][^<]{8,80})</g)]
  .map((m) => m[1].trim())
  .filter((t) => !t.includes('{') && !t.startsWith('http'))
  .slice(0, 30)
console.log('Copy (muestra):\n ', textSnippets.join('\n  '))
