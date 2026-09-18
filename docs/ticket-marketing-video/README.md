# Video de marketing — compra de entrada

`plu-entrada-vip-reel.mp4` — vertical 1080×1920, ~20s, H.264/AAC, listo para Instagram
(Reel/Story).

Muestra el flujo completo de compra de una entrada VIP: vidriera de tipos, formulario de
checkout, pago con Mercado Pago y la entrada digital confirmada (sello + QR real, tilt 3D,
descarga como PNG).

## Cómo se generó

Grabado con Playwright contra la stack local de Docker (Supabase local + `PAYMENTS_MOCK=true`),
nunca contra el proyecto real. El spec que lo produce es
[`e2e/instagram-ticket-reel.spec.js`](../../e2e/instagram-ticket-reel.spec.js) — no es un test
de regresión, es una grabación deliberada en cámara lenta para contenido.

Para regenerarlo:

```bash
npx supabase start
npx playwright test e2e/instagram-ticket-reel.spec.js --project=chromium
```

El video queda en `e2e/.test-results/instagram-ticket-reel-*/video.webm` (ignorado por git);
convertilo a mp4 con ffmpeg si hace falta:

```bash
ffmpeg -i video.webm -vf "fps=30,format=yuv420p" -c:v libx264 -profile:v high -crf 18 \
  -pix_fmt yuv420p -movflags +faststart -an plu-entrada-vip-reel.mp4
```
