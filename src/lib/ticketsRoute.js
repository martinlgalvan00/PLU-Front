/**
 * ticketsRoute.js — PLU ARG
 *
 * Ruta pública de compra de entradas: /evento/entradas
 * Misma convención que securityGateRoute.js (sin react-router).
 *
 * El evento seleccionado viaja como query param (?evento=slug) en vez de
 * un segmento de ruta propio, para no tener que dar de alta una ruta nueva
 * por cada evento que se lanza: cualquier slug publicado en el catálogo de
 * eventos ya es válido acá.
 */

export const TICKETS_PATH = '/evento/entradas'

/**
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function matchTicketsRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  return /^\/evento\/entradas\/?$/.test(pathname)
}

/**
 * @param {string} [search]
 * @returns {string|null}
 */
export function getTicketsRouteEventSlug(search = typeof window !== 'undefined' ? window.location.search : '') {
  return new URLSearchParams(search).get('evento') || null
}

/**
 * @param {string} [eventSlug] Evento a preseleccionar en la página de entradas.
 */
export function pushTicketsRoute(eventSlug) {
  if (typeof window === 'undefined') return
  const search = eventSlug ? `?evento=${encodeURIComponent(eventSlug)}` : ''
  const target = `${TICKETS_PATH}${search}`
  if (window.location.pathname !== TICKETS_PATH || window.location.search !== search) {
    window.history.pushState({ view: 'tickets', eventSlug: eventSlug ?? null }, '', target)
  }
}

export function clearTicketsRoute() {
  if (typeof window === 'undefined') return
  if (matchTicketsRoute()) {
    window.history.pushState({ view: 'home' }, '', '/')
  }
}
