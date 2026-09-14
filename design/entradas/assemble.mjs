// Arma los .dc.html finales a partir de los .src.html y los fragmentos
// compartidos (_base.css, _side.html, _head.html). Cada artboard tiene que ser
// autocontenido, así que los fragmentos se inlinean en vez de importarse.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const base = readFileSync('_base.css', 'utf8').replace(/\s+$/, '')
const side = readFileSync('_side.html', 'utf8').replace(/\s+$/, '')
const head = readFileSync('_head.html', 'utf8').replace(/\s+$/, '')

const sources = readdirSync('.').filter((name) => name.endsWith('.src.html'))

for (const source of sources) {
  const out = source.replace('.src.html', '.dc.html')
  const html = readFileSync(source, 'utf8')
    .replace('@@BASE@@', base)
    .replace('@@SIDE@@', side)
    .replace('@@HEAD@@', head)

  const leftovers = html.match(/@@[A-Z]+@@/g)
  if (leftovers) throw new Error(`${source}: quedaron marcadores sin resolver: ${leftovers.join(', ')}`)

  writeFileSync(out, html)
  console.log(`${out} · ${html.length} bytes`)
}
