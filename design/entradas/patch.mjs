// Correcciones de copy y datos detectadas en el repaso. Se aplican sobre los
// .src.html; los .dc.html se regeneran después con assemble.mjs.
import { readFileSync, writeFileSync } from 'node:fs'

const patches = {
  'Main.src.html': [
    ['Incluye buffet y remera', 'Incluye buffet y programa'],
    ['General · un día', 'General · sábado'],
    ['Tribuna, la jornada que elija', 'Tribuna, solo el sábado'],
    ['<span class="flow-hint">La página del evento todavía no muestra las entradas.</span>',
     '<span class="flow-hint">El bloque de compra está apagado.</span>'],
  ],
  'Movil.src.html': [
    ['Incluye buffet y remera', 'Incluye buffet y programa'],
    ['General · un día', 'General · sábado'],
    ['Tribuna, la jornada que elija', 'Tribuna, solo el sábado'],
    ['Entradas<span class="mtab-n">5</span>', 'Entradas<span class="mtab-n">4</span>'],
    ['<button class="mtab" type="button">Zonas</button>',
     '<button class="mtab" type="button">Zonas y seguridad</button>'],
    ['<div class="rail-scroll">', '<div class="rail-scroll" role="tablist" aria-label="Secciones del evento">'],
    ['<button class="mtab" type="button">Datos</button>',
     '<button class="mtab" role="tab" aria-selected="false" type="button">Datos</button>'],
    ['<button class="mtab" type="button">Estructura',
     '<button class="mtab" role="tab" aria-selected="false" type="button">Estructura'],
    ['<button class="mtab" type="button">Inscripción</button>',
     '<button class="mtab" role="tab" aria-selected="false" type="button">Inscripción</button>'],
    ['<button class="mtab is-active" type="button">Entradas',
     '<button class="mtab is-active" role="tab" aria-selected="true" type="button">Entradas'],
    ['<button class="mtab" type="button">Zonas y seguridad</button>',
     '<button class="mtab" role="tab" aria-selected="false" type="button">Zonas y seguridad</button>'],
  ],
  'Credenciales.src.html': [
    ['General · un día', 'General · sábado'],
    ['<span class="is-end">Canjeadas</span>', '<span class="is-end">Acreditadas</span>'],
    ['<div><dt>Canjeadas</dt>', '<div><dt>Acreditadas</dt>'],
  ],
  'Compras.src.html': [
    ['General · un día', 'General · sábado'],
    ['Comprobante · ayer 21:40', 'Comprobante · hoy 08:02'],
    ['Ver sólo esas', 'Ver solo esas'],
    ['<section class="alert" role="note">', '<section class="alert" aria-label="Compras frenadas">'],
  ],
  'Tipo.src.html': [
    ['Se canja una vez, detrás de plataforma', 'Se canjea una vez, detrás de plataforma'],
    ['<span class="card-hint" style="margin-left: auto;">2 de 4</span>',
     '<span class="card-hint" style="margin-left: auto;">2 de 4 credenciales</span>'],
    ['.cr-add { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--hairline); }',
     '.cr-add { display: flex; align-items: center; gap: 10px; padding: 11px 14px; }'],
    ['.input.is-empty { color: #5f626c; }\n', ''],
    ['body { background: rgba(6,7,9,.78); }',
     'body { background: rgba(6,7,9,.78); display: flex; justify-content: flex-end; min-height: 1160px; }'],
    ['.drawer { width: 640px; min-height: 1000px;', '.drawer { width: 640px; min-height: 1160px;'],
  ],
  'Beneficios.src.html': [
    ['<span class="badge badge--gold">Entrenador</span>',
     '<span class="badge badge--gold">Entrenador · dos días</span>'],
    ['se canjean en el venue', 'se canjean en el predio'],
    ['Todavía no hay canjes: la columna de entregados aparece cuando abre la puerta, el 14 de noviembre.',
     'Todavía no se entregó ninguno: el canje abre junto con la puerta, el 14 de noviembre.'],
    ['<div class="add-row" style="display: flex;', '<div style="display: flex;'],
  ],
  'Hoy.src.html': [
    ['<button class="tab" role="tab" aria-selected="false" type="button">Pagos<span class="tab-count">3</span></button>',
     '<button class="tab" role="tab" aria-selected="false" type="button">Cobros<span class="tab-count">3</span></button>'],
    ['se canjean en el venue', 'se canjean en el predio'],
    ['<span class="ghost-btn" style="align-self: flex-start;">+ Agregar beneficio</span>',
     '<button class="ghost-btn" type="button" style="align-self: flex-start;">+ Agregar beneficio</button>'],
    ['.input.is-empty { color: #5f626c; }\n', ''],
  ],
}

for (const [file, edits] of Object.entries(patches)) {
  let html = readFileSync(file, 'utf8')
  for (const [from, to] of edits) {
    if (!html.includes(from)) throw new Error(`${file}: no se encontró "${from.slice(0, 60)}"`)
    html = html.split(from).join(to)
  }
  writeFileSync(file, html)
  console.log(`${file} · ${edits.length} correcciones`)
}
