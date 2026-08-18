/**
 * securityGateRoute.js — PLU ARG
 *
 * Detecta la ruta /evento/:eventoSlug/seguridad leyendo el path actual del
 * browser. Mismo prefijo /evento/ que ticketsRoute.js (/evento/entradas),
 * para que todas las rutas públicas por evento compartan una convención.
 * La SPA no usa react-router (ver credentialQr.js para el mismo criterio con
 * query params); esto evita agregar una lib de routing solo para esta pantalla.
 */

/**
 * @param {string} [pathname]
 * @returns {{ eventSlug: string } | null}
 */
export function matchSecurityGateRoute(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
) {
  const match = pathname.match(/^\/evento\/([^/]+)\/seguridad\/?$/)
  return match ? { eventSlug: decodeURIComponent(match[1]) } : null
}

/**
 * @param {string} eventSlug
 * @returns {string}
 */
export function buildSecurityGatePath(eventSlug) {
  return `/evento/${encodeURIComponent(eventSlug)}/seguridad`
}
