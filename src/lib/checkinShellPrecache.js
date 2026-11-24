/**
 * Lo que el teléfono de la puerta no abre. Queda fuera del precache del
 * service worker: mapas, la escena 3D, Mercado Pago y la captura de
 * credenciales. Si alguien entra a esas pantallas en el mismo aparato,
 * el navegador las pide por red. La puerta, no.
 */
export const CHECKIN_SHELL_PRECACHE_IGNORE = Object.freeze([
  '**/stats.html',
  '**/html2canvas-*.js',
  '**/vendor-mp-*.js',
  '**/three-*.js',
  '**/maplibre-*.js',
  '**/*maplibre*.css',
])

const SHELL_ASSET = /(?:^|\/)(?:index|vendor-react|vendor-lucide|motion)-[^/]+\.(?:js|css)$/

/**
 * Precache de instalación: el HTML y el JS/CSS de arranque, más las fuentes.
 * Check-in, el panel y el sitio público se guardan después, la primera vez
 * que el teléfono los abre, y no se descargan en el alta del service worker.
 */
export function isCheckinShellAsset(url) {
  const path = String(url ?? '').split('?')[0]
  if (path === 'index.html' || path.endsWith('/index.html')) return true
  if (/\.woff2$/i.test(path)) return true
  return SHELL_ASSET.test(path)
}
