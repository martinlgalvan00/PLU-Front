/**
 * registrationCheckoutRoute.js — PLU ARG
 *
 * Ruta del checkout de inscripción: /evento/:slug/inscripcion. Antes el
 * checkout vivía por estado sobre `/`: recargar o compartir el link mandaba
 * a la portada en medio del pago. Mismo prefijo que eventPageRoute.js; como
 * ese matcher solo acepta /evento/:slug, no se pisan.
 */

const CHECKOUT_PATH = /^\/evento\/([^/]+)\/inscripcion\/?$/

/**
 * @param {string} [pathname]
 * @returns {{ eventSlug: string } | null}
 */
export function matchRegistrationCheckoutRoute(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
) {
  const match = CHECKOUT_PATH.exec(pathname ?? '')
  if (!match) return null
  return { eventSlug: decodeURIComponent(match[1]) }
}

/** @param {string} eventSlug */
export function buildRegistrationCheckoutPath(eventSlug) {
  return `/evento/${encodeURIComponent(eventSlug)}/inscripcion`
}

/** @param {string} eventSlug */
export function pushRegistrationCheckoutRoute(eventSlug) {
  if (typeof window === 'undefined' || !eventSlug) return
  const target = buildRegistrationCheckoutPath(eventSlug)
  if (window.location.pathname !== target) {
    window.history.pushState({ view: 'competition', eventSlug }, '', target)
  }
}
