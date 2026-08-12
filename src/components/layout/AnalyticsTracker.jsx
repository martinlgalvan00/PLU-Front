import { useEffect } from 'react'
import { startAnalytics, trackEvent, trackPageView } from '../../services/analyticsService.js'

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

/**
 * Pasos del embudo que son "haber visto una pantalla".
 *
 * Viven aca y no repartidos por cada pagina por dos razones: quedan
 * automaticamente sincronizados con el router (una vista nueva no puede
 * olvidarse de emitir), y el embudo se lee de un solo archivo en vez de
 * perseguir `trackEvent` por todo `src/pages`.
 *
 * Los nombres tienen que coincidir con `MEMBERSHIP_FUNNEL_STEPS` de
 * `server/routes/analytics.js`: el backend rechaza cualquier otro.
 */
const FUNNEL_VIEW_STEPS = {
  home: 'landing_view',
  members: 'membership_view',
}

export default function AnalyticsTracker({ view }) {
  useEffect(() => startAnalytics(), [])

  // Se monta despues de `DocumentMetaSync` a proposito: React corre los efectos
  // de hermanos en orden de arbol, y `trackPageView` lee `document.title`. Al
  // reves registraria cada vista con el titulo de la anterior.
  useEffect(() => {
    trackPageView({ route: view })

    const step = FUNNEL_VIEW_STEPS[view]
    // El embudo cuenta visitantes unicos, asi que volver a entrar a la misma
    // pantalla no lo infla; igual se emite una sola vez por navegacion porque el
    // efecto depende solo de `view`.
    if (step) trackEvent(step)
  }, [view])

  return null
}
