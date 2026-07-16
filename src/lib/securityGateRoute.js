/**
 * securityGateRoute.js — PLU ARG
 *
 * Detecta la ruta /:eventoSlug/seguridad leyendo el path actual del browser.
 * La SPA no usa react-router (ver credentialQr.js para el mismo criterio con
 * query params); esto evita agregar una lib de routing solo para esta pantalla.
 */

/**
 * @param {string} [pathname]
 * @returns {{ eventSlug: string } | null}
 */
export function matchSecurityGateRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const match = pathname.match(/^\/([^/]+)\/seguridad\/?$/)
  return match ? { eventSlug: decodeURIComponent(match[1]) } : null
}
