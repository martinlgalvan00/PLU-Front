import CompetitionMap from './CompetitionMap.jsx'

export default function EventVenueMap({ event, role, venue }) {
  const venueEvent = {
    ...event,
    address: venue.address,
    addressVenue: venue.name,
    coordinateVenue: venue.name,
    latitude: venue.latitude ?? event?.latitude,
    location: venue.locality ?? event?.location,
    longitude: venue.longitude ?? event?.longitude,
    mapsUrl: venue.mapsUrl,
    title: event?.title,
    venue: venue.name,
    venueRole: role,
  }

  return (
    <CompetitionMap
      className="event-venue-map"
      events={[venueEvent]}
      selectedEventId={venueEvent.slug ?? venueEvent.id}
      showHeader={false}
      showList={false}
      variant="venue"
    />
  )
}
