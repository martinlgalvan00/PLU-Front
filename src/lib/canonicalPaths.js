/**
 * Paths canónicos que la SPA entiende como entry points reales (deep links).
 * El resto de vistas públicas viven por estado (`view`) sobre `/`.
 * Flujos por query (credencial, reset, invitaciones) también viven en `/`.
 */

import { matchEventPageRoute } from './eventPageRoute.js'
import { matchSecurityGateRoute } from './securityGateRoute.js'
import { matchTicketsRoute } from './ticketsRoute.js'

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

/**
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isCanonicalPathname(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
) {
  const path = normalizePathname(pathname)
  if (path === '/') return true
  if (matchTicketsRoute(path)) return true
  if (matchSecurityGateRoute(path)) return true
  if (matchEventPageRoute(path)) return true
  return false
}

/**
 * Vista pública inicial según pathname (sin query flows — esos se resuelven antes).
 * @param {string} [pathname]
 * @returns {'tickets' | 'events' | 'home' | 'notFound'}
 */
export function resolvePathnamePublicView(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
) {
  if (matchTicketsRoute(pathname)) return 'tickets'
  if (matchEventPageRoute(pathname)) return 'events'
  if (isCanonicalPathname(pathname)) return 'home'
  return 'notFound'
}
