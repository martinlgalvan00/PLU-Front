# Share cards — previews de diseño

PNGs **reales** de la card compartible (afiliación, inscripción a torneo y
entrada) generados con el mismo pipeline de producción
(`EventShareCard` + `eventCardService` → html2canvas). Sirven para revisar y
perfeccionar el diseño sin levantar la app ni loguearse.

## Ver

Abrí [`index.html`](./index.html) en el navegador: grilla con todas las
variantes. Click en cualquiera para verla a tamaño completo.

## Regenerar después de tocar el diseño

```bash
npm run share-cards:previews
```

Levanta (o reusa) un dev server de Vite en el puerto `5199`, monta
`scripts/share-card-preview/index.html` con los fixtures, captura cada card
con Playwright + html2canvas y reescribe los PNGs y el `index.html`.

Para iterar en vivo con hot-reload, abrí
`http://localhost:5199/scripts/share-card-preview/index.html` con el dev
server corriendo y editá `src/styles/components/event-share-card.css`.

## Reglas duras de edición (html2canvas)

El PNG se rasteriza con html2canvas, que **no** soporta CSS moderno de color
ni composición. En `event-share-card.css` está prohibido:

- `color-mix()`, `oklch`/`oklab` — solo `hex`/`rgb`/`rgba` planos.
- `background-clip: text` — el texto "transparente" queda como rectángulo
  gris opaco en el PNG.
- `mix-blend-mode`, filtros SVG, `backdrop-filter` dentro de la card.
- `position: fixed` con offsets negativos en la card de captura — rompe el
  rasterizado de texto.
- `box-shadow` con spread para dibujar anillos o bordes (`0 0 0 2px …`) — no
  se rasteriza como anillo: se pinta como un **relleno macizo del color del
  shadow por debajo del elemento**. El medallón de iniciales del avatar salía
  como una mancha dorada con las letras doradas encima (contraste 1.6:1) y el
  chip del QR con un halo crema grueso. Usar `border` real +
  `box-sizing: border-box`. Los `inset` sí funcionan.
- Gradientes de fondo en un elemento que también lleva anillo: el anillo
  queda por encima. Usar `background-color` plano.

Y dos que no son de html2canvas pero solo se ven en el PNG:

- Los `<h2>`/`<p>` sin `margin: 0` arrastran el margen del UA y abren huecos
  de ~90px que en el preview escalado del modal pasan desapercibidos.
- El formato `square` (1080×1080) es el más ajustado del set: el body es
  `flex: 1 1 0%` pero no encoge por debajo de su contenido, así que si una
  variante crece, el pie se va **fuera del lienzo** y el QR sale cortado sin
  ningún aviso. Revisar siempre el post, no solo la historia.

Si el preview del modal se ve bien pero el PNG sale roto, casi seguro es una
de estas.

## Notas

- Los PNGs de acá se capturan con `scale: 1` (1080×1080 / 1080×1920, el
  tamaño canónico de Instagram). La descarga real del usuario usa `scale: 2`
  (misma imagen, más resolución).
- Los QRs de los previews apuntan al origin local del preview; en producción
  apuntan al dominio real. El componente y el generador son los mismos.
- Los datos son fixtures de muestra (ver `scripts/share-card-preview/main.jsx`);
  ningún código de atleta es real.
