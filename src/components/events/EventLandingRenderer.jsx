import EventLandingEditorial from '../../pages/EventLandingEditorial.jsx'
import { eventHasEditorialLanding } from '../../lib/eventLanding.js'

/**
 * Elige la superficie pública del evento según `landing.templateId`.
 * `meet` no se renderiza acá: App deja EventsPage. Solo `editorial` toma
 * el layout completo tipo dossier.
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
}) {
  if (!eventHasEditorialLanding(event) && !eventSlug) return null

  return (
    <EventLandingEditorial
      checkoutAvailability={checkoutAvailability}
      eventSlug={eventSlug ?? event?.slug}
      events={events}
      memberships={memberships}
      onNavigate={onNavigate}
      onSelectEvent={onSelectEvent}
      registrations={registrations}
      session={session}
    />
  )
}
