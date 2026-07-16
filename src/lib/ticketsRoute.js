/**
 * ticketsRoute.js — PLU ARG
 *
 * Ruta pública de compra de entradas: /evento/entradas
 * Misma convención que securityGateRoute.js (sin react-router).
 */

export const TICKETS_PATH = '/evento/entradas'

/**
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function matchTicketsRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  return /^\/evento\/entradas\/?$/.test(pathname)
}

export function pushTicketsRoute() {
  if (typeof window === 'undefined') return
  if (window.location.pathname !== TICKETS_PATH) {
    window.history.pushState({ view: 'tickets' }, '', TICKETS_PATH)
  }
}

export function clearTicketsRoute() {
  if (typeof window === 'undefined') return
  if (matchTicketsRoute()) {
    window.history.pushState({ view: 'home' }, '', '/')
  }
}
