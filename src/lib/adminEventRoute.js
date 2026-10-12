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
 * `/admin/eventos/nuevo` es la página de alta, no el workspace de un evento
 * llamado "nuevo". Comparte el patrón de la ruta con los slugs, pero no puede
 * chocar con uno generado: `slugify` siempre cierra con el año (`titulo-2026`).
 */
export const ADMIN_EVENT_CREATE_SLUG = 'nuevo'

/**
 * @param {string | null | undefined} eventSlug  `eventSlug` de `matchAdminEventRoute`.
 * @returns {boolean}
 */
export function isAdminEventCreateSlug(eventSlug) {
  return eventSlug === ADMIN_EVENT_CREATE_SLUG
}

export function pushAdminEventCreateRoute() {
  pushAdminEventRoute(ADMIN_EVENT_CREATE_SLUG)
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

/**
 * Vuelve del workspace al listado. Navega a `/` y NO a `/admin`: el panel vive
 * sobre `/` por estado (`view === 'admin'`), y `/admin` no es un path canónico
 * —- no está en `PUBLIC_VIEW_PATHS` ni en `isCanonicalPathname` -—, así que
 * empujarlo hacía que el handler de `popstate` cayera en `setView('notFound')`
 * y el botón Volver tirara toda la SPA a 404.
 */
export function clearAdminEventRoute() {
  if (typeof window !== 'undefined') {
    window.history.pushState(null, '', '/')
    window.dispatchEvent(new Event('popstate'))
  }
}

/**
 * Mientras `/admin/eventos/:slug` está activo, el panel no puede cambiar de
 * sección: el slug fuerza Eventos. Hay que soltarlo al ir a otro lugar, y
 * también al volver a tocar Eventos para ver el listado.
 *
 * @param {{ workspaceSlug?: string | null, currentSection?: string | null, nextSection?: string | null }} params
 * @returns {boolean}
 */
export function shouldClearAdminEventWorkspace({
  workspaceSlug,
  currentSection,
  nextSection,
} = {}) {
  if (!workspaceSlug) return false
  if (nextSection !== 'events') return true
  return currentSection === 'events'
}
