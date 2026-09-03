/**
 * adminEventRoute.js — PLU ARG
 *
 * Ruta de administración de un evento puntual: /admin/eventos/:slug
 * Abre la sección "Eventos" del panel de administración con ese evento
 * preseleccionado y su workspace desplegado a pantalla completa.
 */

/**
 * @param {string} [pathname]
 * @returns {{ eventSlug: string } | null}
 */
export function matchAdminEventRoute(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
) {
  const match = pathname.match(/^\/admin\/eventos\/([^/]+)\/?$/)
  if (!match) return null
  const slug = decodeURIComponent(match[1])
  return { eventSlug: slug }
}

/**
 * @param {string} eventSlug
 * @returns {string}
 */
export function buildAdminEventPath(eventSlug) {
  return `/admin/eventos/${encodeURIComponent(eventSlug)}`
}

export function pushAdminEventRoute(eventSlug) {
  if (typeof window !== 'undefined') {
    window.history.pushState(null, '', buildAdminEventPath(eventSlug))
    window.dispatchEvent(new Event('popstate'))
  }
}

export function clearAdminEventRoute() {
  if (typeof window !== 'undefined') {
    window.history.pushState(null, '', '/admin#events')
    window.dispatchEvent(new Event('popstate'))
  }
}
