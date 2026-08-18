/**
 * eventPageRoute.js — PLU ARG
 *
 * Ruta pública de un evento puntual: /evento/:slug — abre la sección
 * "Eventos" con ese evento preseleccionado. Mismo prefijo /evento/ que
 * ticketsRoute.js y securityGateRoute.js, pero como esos dos matchean rutas
 * más específicas (/evento/entradas, /evento/:slug/seguridad), este matcher
 * es el más genérico y se evalúa último para no pisarlas.
 */

/**
 * @param {string} [pathname]
 * @returns {{ eventSlug: string } | null}
 */
export function matchEventPageRoute(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
) {
  const match = pathname.match(/^\/evento\/([^/]+)\/?$/)
  if (!match) return null
  const slug = decodeURIComponent(match[1])
  if (slug === 'entradas') return null
  return { eventSlug: slug }
}

/**
 * @param {string} eventSlug
 * @returns {string}
 */
export function buildEventPagePath(eventSlug) {
  return `/evento/${encodeURIComponent(eventSlug)}`
}

/**
 * @param {string} eventSlug
 */
export function pushEventPageRoute(eventSlug) {
  if (typeof window === 'undefined' || !eventSlug) return
  const target = buildEventPagePath(eventSlug)
  if (window.location.pathname !== target) {
    window.history.pushState({ view: 'events', eventSlug }, '', target)
  }
}

export function clearEventPageRoute() {
  if (typeof window === 'undefined') return
  if (matchEventPageRoute()) {
    window.history.pushState({ view: 'home' }, '', '/')
  }
}
