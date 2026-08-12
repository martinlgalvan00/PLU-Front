/**
 * publicViewPaths.js — PLU ARG
 *
 * Deep links canónicos para vistas públicas que antes vivían solo por
 * `view` sobre `/`. Misma idea que ticketsRoute / eventPageRoute.
 */

const PUBLIC_VIEW_PATHS = Object.freeze({
  members: '/afiliacion',
  events: '/calendario',
  rulebook: '/reglamento',
  results: '/resultados',
  records: '/records',
  pitbull: '/pitbull',
  shop: '/tienda',
  community: '/comunidad',
  faq: '/faq',
  contact: '/contacto',
  resources: '/recursos',
  team: '/nosotros',
  sponsors: '/sponsors',
  standards: '/estandares',
})

const PATH_TO_VIEW = Object.freeze(
  Object.fromEntries(Object.entries(PUBLIC_VIEW_PATHS).map(([view, path]) => [path, view])),
)

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

/**
 * @param {string} [pathname]
 * @returns {keyof typeof PUBLIC_VIEW_PATHS | null}
 */
export function matchPublicViewPath(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
) {
  const path = normalizePathname(pathname)
  return PATH_TO_VIEW[path] ?? null
}

/**
 * @param {string} view
 * @returns {string | null}
 */
export function buildPublicViewPath(view) {
  return PUBLIC_VIEW_PATHS[view] ?? null
}

/**
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isPublicViewPathname(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
) {
  return matchPublicViewPath(pathname) != null
}

/**
 * @param {string} view
 */
export function pushPublicViewPath(view) {
  if (typeof window === 'undefined') return
  const target = buildPublicViewPath(view)
  if (!target) return
  if (window.location.pathname !== target) {
    window.history.pushState({ view }, '', target)
  }
}

export function clearPublicViewPath() {
  if (typeof window === 'undefined') return
  if (matchPublicViewPath()) {
    window.history.pushState({ view: 'home' }, '', '/')
  }
}

export { PUBLIC_VIEW_PATHS }
