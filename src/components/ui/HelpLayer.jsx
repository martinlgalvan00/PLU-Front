import { useCallback, useEffect, useMemo } from 'react'
import AssistNavBar from '../layout/AssistNavBar.jsx'
import HelpDock from './HelpDock.jsx'
import HelpPanel from './HelpPanel.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useHelp } from '../../providers/HelpProvider.jsx'
import { useAssist } from '../../providers/AssistProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { isJourneyActionRedundant, resolveAthleteJourney } from '../../lib/athleteJourney.js'
import { getPublicTour } from '../../lib/publicTourSteps.js'
import { markHomeGuideSeen } from '../../lib/homeGuideStorage.js'

/**
 * Capa de ayuda y navegación asistida de las pantallas públicas y de la cuenta.
 *
 * Resuelve el estado del trámite una sola vez y de ahí salen las tres piezas
 * que lo consumen: el panel, el botón flotante y —en modo asistido— la barra
 * de navegación recortada. El botón y la barra son excluyentes: dos elementos
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
  const { replayTour } = useAdminTour()

  const journey = useMemo(
    () => resolveAthleteJourney({ session, memberships, registrations, event }),
    [session, memberships, registrations, event],
  )

  const tour = useMemo(() => getPublicTour(view, t), [view, t])
  const pending = !journey.complete && journey.next.step != null
  const isAthlete = session?.role === 'athlete_plu'

  // Se marca "vista" al abrir y no al cerrar, y por estado y no en el click:
  // la portada también la abre sola en la primera visita mobile. Así los dos
  // caminos quedan cubiertos y una recarga con el panel abierto no hace que la
  // portada vuelva a insistir.
  useEffect(() => {
    if (open) markHomeGuideSeen()
  }, [open])

  /** La única acción del trámite, compartida por el panel y por la barra. */
  const runJourneyAction = useCallback(() => {
    const { next } = journey
    if (next.intent === 'event') {
      onSelectEvent?.(event)
      return
    }
    onNavigate?.(next.view, next.options ?? {})
  }, [event, journey, onNavigate, onSelectEvent])

  const startTour = useCallback(() => {
    if (!tour) return
    replayTour(tour.id, tour.steps, { mode: tour.mode })
  }, [replayTour, tour])

  return (
    <>
      {open ? (
        <HelpPanel
          journey={journey}
          atDestination={isJourneyActionRedundant(journey.next, view)}
          tourMode={tour?.mode ?? null}
          onClose={closeHelp}
          onNavigate={onNavigate}
          onRunNext={runJourneyAction}
          onStartTour={tour ? startTour : null}
        />
      ) : null}

      {assist ? (
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
      ) : (
        <HelpDock open={open} pending={pending} onToggle={() => toggleHelp('dock')} />
      )}
    </>
  )
}
