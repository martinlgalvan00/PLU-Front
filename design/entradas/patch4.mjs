// Suma el capítulo Cobro a la navegación de los artboards que ya existían.
import { readFileSync, writeFileSync } from 'node:fs'

const COBRO = '<button class="chapter" role="tab" aria-selected="false" type="button">Cobro<small>2 medios abiertos</small></button>'
const desktop = ['Main.src.html', 'Credenciales.src.html', 'Beneficios.src.html', 'Compras.src.html']

for (const file of desktop) {
  const html = readFileSync(file, 'utf8')
  if (html.includes('>Cobro<small>')) {
    console.log(`${file} · ya tenía Cobro`)
    continue
  }
  const next = html.replace(
    /(\n(\s*))(<button class="chapter[^>]*>Compras<small>)/,
    `$1${COBRO}$1$3`,
  )
  if (next === html) throw new Error(`${file}: no se encontró el capítulo Compras`)
  writeFileSync(file, next)
  console.log(`${file} · Cobro agregado`)
}

const movil = readFileSync('Movil.src.html', 'utf8')
if (movil.includes('>Cobro</button>')) {
  console.log('Movil.src.html · ya tenía Cobro')
} else {
  const next = movil.replace(
    /(\n(\s*))(<button class="subtab"[^>]*>Compras<\/button>)/,
    '$1<button class="subtab" role="tab" aria-selected="false" type="button">Cobro</button>$1$3',
  )
  if (next === movil) throw new Error('Movil: no se encontró la subpestaña Compras')
  writeFileSync('Movil.src.html', next)
  console.log('Movil.src.html · Cobro agregado')
}
