import CompetitionMap from './CompetitionMap.jsx'

export default function EventVenueMap({ event, role, venue }) {
  const venueEvent = {
    ...event,
    address: venue.address,
    addressVenue: venue.name,
    coordinateVenue: venue.name,
    featured: true,
    id: event?.slug ?? event?.id ?? 'pitbull-classic-2026',
    latitude: venue.latitude ?? event?.latitude,
    location: venue.locality ?? event?.location,
    longitude: venue.longitude ?? event?.longitude,
    mapsUrl: venue.mapsUrl,
    slug: event?.slug ?? event?.id ?? 'pitbull-classic-2026',
    title: event?.title,
    venue: venue.name,
    venueRole: role,
  }

  return (
    <CompetitionMap
      className="event-venue-map"
      events={[venueEvent]}
      selectedEventId={venueEvent.slug}
      showHeader={false}
      showList={false}
      showSelection={false}
      variant="venue"
    />
  )
}
