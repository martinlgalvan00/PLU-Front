import EventBuilderLandingPage from '../../pages/EventBuilderLandingPage.jsx'
import EventLandingEditorial from '../../pages/EventLandingEditorial.jsx'
import EventsPage from '../../pages/EventsPage.jsx'
import EventUnderConstructionPage from '../../pages/EventUnderConstructionPage.jsx'
import SubmissionLandingPage from '../../pages/SubmissionLandingPage.jsx'
import {
  eventHasBuilderLanding,
  eventHasEditorialLanding,
  eventHasSubmissionLanding,
  eventLandingUnderConstruction,
  eventSubmissionLandingInPreparation,
} from '../../lib/eventLanding.js'

/**
 * Elige la superficie pública del evento según `landing.templateId` y el
 * interruptor de la landing:
 *
 *   - apagada            → "Plataforma en construcción"
 *   - `builder`         → landing por bloques (Constructor)
 *   - `submission`       → landing propia de Submission
 *   - `editorial`        → dossier tipo Pitbull
 *   - `meet` (default)   → la ficha del calendario
 *
 * Lo usa la vista previa del panel; el sitio público arma lo mismo en `App`
 * porque la ficha `meet` vive dentro de la navegación del calendario.
 * `preview` apaga las consultas al servidor para mostrar el borrador tal cual.
 */
export default function EventLandingRenderer({
  event,
  eventSlug,
  onNavigate,
  onSelectEvent,
  events,
  session,
  memberships,
  registrations,
  checkoutAvailability,
  preview = false,
}) {
  const slug = eventSlug ?? event?.slug
  const catalog = events ?? (event ? [event] : [])

  if (eventLandingUnderConstruction(event) || eventSubmissionLandingInPreparation(event)) {
    return (
      <EventUnderConstructionPage
        event={event}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
        registrationEnabled={checkoutAvailability?.registrationEnabled !== false}
      />
    )
  }

  if (eventHasBuilderLanding(event)) {
    return (
      <EventBuilderLandingPage
        checkoutAvailability={checkoutAvailability}
        eventSlug={slug}
        events={catalog}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
      />
    )
  }

  if (eventHasSubmissionLanding(event)) {
    return (
      <SubmissionLandingPage
        eventSlug={slug}
        events={catalog}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
      />
    )
  }

  if (eventHasEditorialLanding(event)) {
    return (
      <EventLandingEditorial
        checkoutAvailability={checkoutAvailability}
        eventSlug={slug}
        events={catalog}
        memberships={memberships}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
        registrations={registrations}
        session={session}
      />
    )
  }

  return (
    <EventsPage
      checkoutAvailability={checkoutAvailability}
      disableRemote={preview}
      events={catalog}
      initialEventSlug={slug}
      memberships={memberships}
      onNavigate={onNavigate}
      onSelectEvent={onSelectEvent}
      registrations={registrations}
      session={session}
    />
  )
}
