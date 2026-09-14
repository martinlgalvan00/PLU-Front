// Segunda tanda: lo que quedó del repaso — medidores sin cupo, jornadas,
// taxonomía de estados en Compras, columnas muertas en Credenciales.
import { readFileSync, writeFileSync } from 'node:fs'

const CHAPTER_OLD = '<button class="chapter" role="tab" aria-selected="false" type="button">Compras<small>276 · 3 a revisar</small></button>'
const CHAPTER_NEW = '<button class="chapter" role="tab" aria-selected="false" type="button">Compras<small>281 · 3 en proceso</small></button>'

const patches = {
  'Beneficios.src.html': [
    ['se canjean una sola vez en el venue', 'se canjean una sola vez en el predio'],
    [CHAPTER_OLD, CHAPTER_NEW],
  ],
  'Hoy.src.html': [
    ['se canjean en el venue', 'se canjean en el predio'],
  ],
  'Main.src.html': [
    [CHAPTER_OLD, CHAPTER_NEW],
    // Un medidor lleno junto a "sin cupo" se lee como agotado: sin límite no
    // hay proporción que mostrar.
    ['<span>sin cupo</span></span><span class="meter"><i style="width: 100%;"></i></span>', '<span>sin cupo</span></span>'],
    ['<span>sin cupo</span></span><span class="meter"><i style="width: 0%;"></i></span>', '<span>sin cupo</span></span>'],
    // La columna Jornadas no distinguía nada: todos los tipos marcaban las dos.
    ['<span class="days"><span class="day">S</span><span class="day">D</span></span>\n        <span class="price num">$ 12.000</span>',
     '<span class="days"><span class="day">S</span><span class="day is-off">D</span></span>\n        <span class="price num">$ 12.000</span>'],
  ],
  'Credenciales.src.html': [
    [CHAPTER_OLD, CHAPTER_NEW],
    // El badge de la columna "La emite" es de clase, no de estado: en la fila
    // pausada cambiaba de significado.
    ['<span class="mx-from"><span class="badge badge--off">Pausada</span>Menores de 12</span>',
     '<span class="mx-from"><span class="badge badge--soft">Público</span>Menores de 12</span>'],
    // La banda de columna apagada se cortaba: sólo la tenían las filas.
    ['<span class="zone is-dead">Zona de atletas<small>no lee entradas</small></span>',
     '<span class="zone is-dead col-dead">Zona de atletas<small>no lee entradas</small></span>'],
    ['<span class="zone is-dead">Staff técnico<small>no escanea</small></span>',
     '<span class="zone is-dead col-dead">Staff técnico<small>no escanea</small></span>'],
    [`        <span>6 credenciales configuradas en 5 tipos</span>
        <span></span>
        <span style="text-align: center;">276</span>
        <span></span>
        <span style="text-align: center;">18</span>
        <span></span>`,
     `        <span>6 credenciales configuradas en 5 tipos</span>
        <span></span>
        <span style="text-align: center;">276</span>
        <span class="col-dead"></span>
        <span style="text-align: center;">18</span>
        <span class="col-dead"></span>`],
  ],
  'Movil.src.html': [
    ['<span><b>128</b> vendidas · sin cupo</span><span class="meter"><i style="width: 100%;"></i></span>',
     '<span><b>128</b> vendidas · sin cupo</span>'],
    ['    .foot { position: sticky;',
     `    .tk-more { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border: 1px dashed var(--hairline); border-radius: 11px; font-size: 11.5px; color: var(--muted); }
    .foot { position: sticky;`],
  ],
}

// La cuarta tarjeta del teléfono no entraba en 844: pasa a una línea que además
// nombra el tipo que faltaba en la lista.
const movilCard = readFileSync('Movil.src.html', 'utf8')
const start = movilCard.indexOf('  <article class="tk" style="opacity: .62;">')
const end = movilCard.indexOf('</article>', start) + '</article>\n'.length
if (start < 0) throw new Error('Movil: no se encontró la tarjeta pausada')
patches['Movil.src.html'].push([
  movilCard.slice(start, end),
  '  <div class="tk-more">2 tipos más: General · dos días ($ 20.000, 96 vendidas) y Menores de 12, pausada.</div>\n',
])

// Compras: las cinco compras que no están pagadas no pueden contarse como
// vendidas. El total de órdenes pasa a 281 y las 276 pagadas son las que
// emiten credenciales y suman al recaudado.
patches['Compras.src.html'] = [
  [CHAPTER_OLD.replace('class="chapter"', 'class="chapter is-active"').replace('aria-selected="false"', 'aria-selected="true"'),
   CHAPTER_NEW.replace('class="chapter"', 'class="chapter is-active"').replace('aria-selected="false"', 'aria-selected="true"')],
  ['<h2 class="alert-t">3 transferencias esperando que alguien las mire</h2>',
   '<h2 class="alert-t">3 compras frenadas antes de emitir las entradas</h2>'],
  ['<p class="alert-p">Mientras tanto el lugar queda reservado 24 horas. Si nadie aprueba, la reserva se libera sola y el cupo vuelve a la venta.</p>',
   '<p class="alert-p">Dos subieron el comprobante y esperan aprobación; una todavía no lo subió. Mientras tanto el lugar queda reservado 24 horas: si nadie aprueba, la reserva se libera sola y el cupo vuelve a la venta.</p>'],
  [`      <button class="pill is-on" type="button">Todas<span class="pill-n">276</span></button>
      <button class="pill" type="button">A revisar<span class="pill-n is-warn">3</span></button>
      <button class="pill" type="button">Pagadas<span class="pill-n">271</span></button>
      <button class="pill" type="button">Vencidas<span class="pill-n">2</span></button>`,
   `      <button class="pill is-on" type="button">Todas<span class="pill-n">281</span></button>
      <button class="pill" type="button">A revisar<span class="pill-n is-warn">2</span></button>
      <button class="pill" type="button">Falta comprobante<span class="pill-n is-warn">1</span></button>
      <button class="pill" type="button">Pagadas<span class="pill-n">276</span></button>
      <button class="pill" type="button">Vencidas<span class="pill-n">2</span></button>`],
  ['<span>276 compras de este evento</span>', '<span>276 pagadas · 3 en proceso · 2 vencidas</span>'],
  [`        <span>1 – 6 de 276</span>
        <span class="sep">·</span>
        <span>25 por página</span>`,
   `        <span>Las 6 más recientes</span>
        <span class="sep">·</span>
        <span>281 compras en total</span>`],
  ['General · un día', 'General · sábado'],
  ['Comprobante · ayer 21:40', 'Comprobante · hoy 08:02'],
  ['Ver sólo esas', 'Ver solo esas'],
  ['<section class="alert" role="note">', '<section class="alert" aria-label="Compras frenadas">'],
]

for (const [file, edits] of Object.entries(patches)) {
  let html = readFileSync(file, 'utf8')
  for (const [from, to] of edits) {
    if (!html.includes(from)) {
      console.warn(`· ${file}: ya aplicado o ausente — "${from.slice(0, 50).replace(/\n/g, ' ')}"`)
      continue
    }
    html = html.split(from).join(to)
  }
  writeFileSync(file, html)
  console.log(`${file} · ok`)
}
