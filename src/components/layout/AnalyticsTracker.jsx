import { useEffect } from 'react'
import { startAnalytics, trackPageView } from '../../services/analyticsService.js'

/**
 * AnalyticsTracker — PLU ARG
 *
 * Puente entre el router por estado de `App.jsx` y el tracker.
 *
 * El sitio no usa react-router: la vista vive en `useState` y la URL se
 * sincroniza con la History API. Por eso el pageview se dispara al cambiar
 * `view` y no con un `useLocation`, y la ruta real se lee de
 * `window.location.pathname` en el momento del evento.
 *
 * `startAnalytics` es idempotente, asi que el doble montaje de StrictMode en
 * desarrollo no duplica listeners ni vistas.
 */
export default function AnalyticsTracker({ view }) {
  useEffect(() => startAnalytics(), [])

  // Se monta despues de `DocumentMetaSync` a proposito: React corre los efectos
  // de hermanos en orden de arbol, y `trackPageView` lee `document.title`. Al
  // reves registraria cada vista con el titulo de la anterior.
  useEffect(() => {
    trackPageView({ route: view })
  }, [view])

  return null
}
