/**
 * Importa un export de Claude Design (HTML standalone) al repo y lo extrae
 * para portarlo a React/CSS.
 *
 * Uso:
 *   npm run design:import -- <url-publica>
 *   npm run design:import -- ./ruta/local.html "PLU ARG - Sitio Publico"
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const [urlOrFile, titleArg] = process.argv.slice(2)
const title = titleArg ?? 'PLU ARG - Sitio Publico'
const outDir = path.join(process.cwd(), 'design-reference')
const outFile = path.join(outDir, `${title} (standalone).html`)

function usage() {
  console.log(`
Importa Claude Design → design-reference/

  npm run design:import -- <url-o-archivo-local> ["titulo"]

Pasos siguientes (manual o con el agente):
  1. Revisar design-reference/extracted-design.html
  2. Portar sección por sección a src/components/ + src/styles/
  3. Cablear en src/pages/
  4. npm run storybook para validar componentes aislados
  5. npm run dev para validar la página real
`)
}

if (!urlOrFile || urlOrFile === '--help' || urlOrFile === '-h') {
  usage()
  process.exit(urlOrFile ? 0 : 1)
}

fs.mkdirSync(outDir, { recursive: true })

let raw
if (/^https?:\/\//i.test(urlOrFile)) {
  console.log('Descargando:', urlOrFile)
  const res = await fetch(urlOrFile)
  if (!res.ok) {
    console.error(`Error HTTP ${res.status} al descargar el diseño`)
    process.exit(1)
  }
  raw = await res.text()
} else {
  const localPath = path.resolve(urlOrFile)
  if (!fs.existsSync(localPath)) {
    console.error('No existe el archivo:', localPath)
    process.exit(1)
  }
  raw = fs.readFileSync(localPath, 'utf8')
}

fs.writeFileSync(outFile, raw)
console.log('Guardado:', path.relative(process.cwd(), outFile))

const extract = spawnSync('node', ['scripts/extract-design-ref.mjs', outFile], {
  stdio: 'inherit',
  cwd: process.cwd(),
})

if (extract.status !== 0) {
  process.exit(extract.status ?? 1)
}

console.log('\nListo. Pedile al agente que porte las secciones nuevas o distintas al código.')
