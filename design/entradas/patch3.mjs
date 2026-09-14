// Lo que quedó sin aplicar cuando patch.mjs cortó en Beneficios.
import { readFileSync, writeFileSync } from 'node:fs'

const patches = {
  'Beneficios.src.html': [
    ['<span class="badge badge--gold">Entrenador</span>',
     '<span class="badge badge--gold">Entrenador · dos días</span>'],
    ['Todavía no hay canjes: la columna de entregados aparece cuando abre la puerta, el 14 de noviembre.',
     'Todavía no se entregó ninguno: el canje abre junto con la puerta, el 14 de noviembre.'],
    ['<div class="add-row" style="display: flex;', '<div style="display: flex;'],
  ],
  'Hoy.src.html': [
    ['<button class="tab" role="tab" aria-selected="false" type="button">Pagos<span class="tab-count">3</span></button>',
     '<button class="tab" role="tab" aria-selected="false" type="button">Cobros<span class="tab-count">3</span></button>'],
    ['<span class="ghost-btn" style="align-self: flex-start;">+ Agregar beneficio</span>',
     '<button class="ghost-btn" type="button" style="align-self: flex-start;">+ Agregar beneficio</button>'],
    ['    .input.is-empty { color: #5f626c; }\n', ''],
  ],
  'Main.src.html': [
    // Decía lo mismo dos veces en la misma celda.
    ['<span class="flow-hint">El bloque de compra está apagado.</span>',
     '<span class="flow-hint">En la página del evento no aparece el botón de compra.</span>'],
  ],
}

for (const [file, edits] of Object.entries(patches)) {
  let html = readFileSync(file, 'utf8')
  for (const [from, to] of edits) {
    if (!html.includes(from)) {
      console.warn(`· ${file}: ausente — "${from.slice(0, 50)}"`)
      continue
    }
    html = html.split(from).join(to)
  }
  writeFileSync(file, html)
  console.log(`${file} · ok`)
}
