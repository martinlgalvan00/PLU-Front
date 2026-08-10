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
