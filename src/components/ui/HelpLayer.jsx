import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import HelpDock from './HelpDock.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useHelp } from '../../providers/HelpProvider.jsx'
import { useAssist } from '../../providers/AssistProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { isJourneyActionRedundant, resolveAthleteJourney } from '../../lib/athleteJourney.js'
import { getOrientationTour, getPublicTour } from '../../lib/publicTourSteps.js'
import { markHomeGuideSeen } from '../../lib/homeGuideStorage.js'

const AssistNavBar = lazy(() => import('../layout/AssistNavBar.jsx'))
const HelpPanel = lazy(() => import('./HelpPanel.jsx'))

/**
 * Capa de ayuda y navegación asistida de las pantallas públicas y de la cuenta.
 *
 * Resuelve el estado del trámite una sola vez y de ahí salen las tres piezas
 * que lo consumen: el panel, el botón flotante y —en modo simple— la barra de
 * navegación recortada. El botón y la barra son excluyentes: dos elementos
 * fijos compitiendo por la misma esquina en un teléfono era exactamente lo que
 * había que evitar.
 *
 * La navegación la ejecuta `App` con las mismas funciones que usan los CTA de
 * cada pantalla (`onNavigate`, `onSelectEvent`), así que la ayuda no puede
 * llevar a un lugar al que el botón real de la pantalla no llevaría.
 */
export default function HelpLayer({
  view,
  session = null,
  memberships = [],
  registrations = [],
  event = null,
  onNavigate,
  onSelectEvent,
}) {
  const { t } = useI18n()
  const { open, closeHelp, toggleHelp } = useHelp()
  const { assist } = useAssist()
  const { replayTour, startTour, readTourProgress } = useAdminTour()

  const journey = useMemo(
    () => resolveAthleteJourney({ session, memberships, registrations, event }),
    [session, memberships, registrations, event],
  )

  const tour = useMemo(() => getPublicTour(view, t, { assist }), [view, t, assist])
  const pending = !journey.complete && journey.next.step != null
  const isAthlete = session?.role === 'athlete_plu'

  // ¿Quedó un recorrido a medias? Sólo se ofrece retomarlo si el paso guardado
  // sigue existiendo: los recorridos cambian de largo entre modo normal y
  // simple, y mandar a alguien a un paso que ya no está sería peor que nada.
  const resume = useMemo(() => {
    if (!tour || !open) return null
    const step = readTourProgress(tour.id)
    if (step == null || step >= tour.steps.length) return null
    return { step, total: tour.steps.length }
  }, [tour, open, readTourProgress])

  // Se marca "vista" al abrir y no al cerrar, y por estado y no en el click:
  // la portada también la abre sola en la primera visita mobile. Así los dos
  // caminos quedan cubiertos y una recarga con el panel abierto no hace que la
  // portada vuelva a insistir.
  useEffect(() => {
    if (open) markHomeGuideSeen()
  }, [open])

  // Activar el modo simple cambia la navegación entera: la barra de cuatro
  // botones reemplaza al navbar que la persona venía mirando. Dejarla sola
  // frente a algo nuevo es justo lo que hay que evitar, así que la primera vez
  // se cierra el panel y arranca la orientación de esa barra. `startTour`
  // respeta la preferencia de recorridos, así que no insiste después.
  const previousAssist = useRef(assist)
  useEffect(() => {
    if (assist && !previousAssist.current) {
      const orientation = getOrientationTour(t, { assist: true, view })
      closeHelp()
      startTour(orientation.id, orientation.steps, { mode: orientation.mode })
    }
    previousAssist.current = assist
  }, [assist, closeHelp, startTour, t, view])

  /** La única acción del trámite, compartida por el panel y por la barra. */
  const runJourneyAction = useCallback(() => {
    const { next } = journey
    if (next.intent === 'event') {
      onSelectEvent?.(event)
      return
    }
    onNavigate?.(next.view, next.options ?? {})
  }, [event, journey, onNavigate, onSelectEvent])

  const runTour = useCallback(() => {
    if (!tour) return
    replayTour(tour.id, tour.steps, {
      mode: tour.mode,
      startIndex: resume?.step ?? 0,
    })
  }, [replayTour, resume, tour])

  return (
    <>
      {open ? (
        <Suspense fallback={null}>
          <HelpPanel
            journey={journey}
            view={view}
            atDestination={isJourneyActionRedundant(journey.next, view)}
            tourKind={tour?.kind ?? null}
            resume={resume}
            onClose={closeHelp}
            onNavigate={onNavigate}
            onRunNext={runJourneyAction}
            onLogin={() => onNavigate?.('login')}
            onStartTour={tour ? runTour : null}
          />
        </Suspense>
      ) : null}

      {assist ? (
        <Suspense fallback={null}>
          <AssistNavBar
            view={view}
            actionKey={journey.next.actionKey}
            isAthlete={isAthlete}
            pending={pending}
            helpOpen={open}
            onNavigate={onNavigate}
            onRunAction={runJourneyAction}
            onOpenHelp={() => toggleHelp('assist-nav')}
          />
        </Suspense>
      ) : (
        <HelpDock open={open} pending={pending} onToggle={() => toggleHelp('dock')} />
      )}
    </>
  )
}
