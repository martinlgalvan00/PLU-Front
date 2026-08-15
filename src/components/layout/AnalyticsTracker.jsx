import { useEffect, useRef } from 'react'
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
  members: 'membership_view',
}

/**
 * Primer paso del embudo. Se emite en la primera vista de **cualquier** pagina,
 * no solo en la portada.
 *
 * Cuando dependia de `view === 'home'`, toda sesion que entrara directo a una
 * landing profunda nunca lo emitia, y como el embudo exige arrancar por el paso
 * 1, esas sesiones quedaban descartadas enteras —no del primer paso, del embudo
 * completo—. Sobre el trafico real del sitio eran el 39%: 95 sesiones entrando
 * por `/pitbull` y 51 por `/afiliacion`, en su mayoria desde Instagram, que
 * linkea directo a la pagina de cada cosa y no a la portada.
 */
const ENTRY_FUNNEL_STEP = 'landing_view'

export default function AnalyticsTracker({ view }) {
  // Una vez por montaje. Volver a la portada a mitad de la navegacion no
  // reabre el embudo, y el `min(occurred_at)` de la RPC absorbe el reemitido
  // que produce una recarga completa.
  const entryTracked = useRef(false)

  useEffect(() => startAnalytics(), [])

  // Se monta despues de `DocumentMetaSync` a proposito: React corre los efectos
  // de hermanos en orden de arbol, y `trackPageView` lee `document.title`. Al
  // reves registraria cada vista con el titulo de la anterior.
  useEffect(() => {
    trackPageView({ route: view })

    // Antes que el paso de pantalla: si alguien entra directo a `/afiliacion`,
    // los dos pasos salen en el mismo lote y el embudo exige que el primero no
    // sea posterior al segundo.
    if (!entryTracked.current) {
      entryTracked.current = true
      trackEvent(ENTRY_FUNNEL_STEP)
    }

    const step = FUNNEL_VIEW_STEPS[view]
    // El embudo cuenta visitantes unicos, asi que volver a entrar a la misma
    // pantalla no lo infla; igual se emite una sola vez por navegacion porque el
    // efecto depende solo de `view`.
    if (step) trackEvent(step)
  }, [view])

  return null
}
