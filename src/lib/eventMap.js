const MIN_LATITUDE = -90
const MAX_LATITUDE = 90
const MIN_LONGITUDE = -180
const MAX_LONGITUDE = 180

export function getMapMarkerKind(event = {}) {
  if (event.featured) return 'featured'

  switch (event.status) {
    case 'inscripcion_abierta':
      return 'open'
    case 'cupos_limitados':
      return 'limited'
    // Un evento con el cupo lleno ya no toma inscripciones: en el mapa se lee
    // igual que uno cerrado.
    case 'agotado':
    case 'cerrado':
      return 'closed'
    case 'finalizado':
      return 'completed'
    default:
      return 'upcoming'
  }
}

function finiteNumber(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function coordinateCandidate(event = {}) {
  const venue = typeof event.venue === 'object' && event.venue ? event.venue : {}
  const coordinates = event.coordinates ?? venue.coordinates ?? {}

  return {
    lat:
      event.latitude ??
      event.lat ??
      coordinates.latitude ??
      coordinates.lat ??
      venue.latitude ??
      venue.lat,
    lng:
      event.longitude ??
      event.lng ??
      coordinates.longitude ??
      coordinates.lng ??
      venue.longitude ??
      venue.lng,
  }
}

export function getEventCoordinates(event) {
  const currentVenueName = getVenueName(event).trim().toLocaleLowerCase()
  const coordinateVenue = String(event?.coordinateVenue ?? event?.addressVenue ?? '')
    .trim()
    .toLocaleLowerCase()
  if (coordinateVenue && currentVenueName && coordinateVenue !== currentVenueName) return null

  const candidate = coordinateCandidate(event)
  const lat = finiteNumber(candidate.lat)
  const lng = finiteNumber(candidate.lng)

  if (
    lat == null ||
    lng == null ||
    lat < MIN_LATITUDE ||
    lat > MAX_LATITUDE ||
    lng < MIN_LONGITUDE ||
    lng > MAX_LONGITUDE
  ) {
    return null
  }

  return { lat, lng }
}

export function getEventAddress(event = {}) {
  const venue = typeof event.venue === 'object' && event.venue ? event.venue : {}
  const explicit = event.address ?? venue.address
  const currentVenueName = getVenueName(event).trim().toLocaleLowerCase()
  const addressVenue = String(event.addressVenue ?? '')
    .trim()
    .toLocaleLowerCase()
  const addressMatchesVenue =
    !addressVenue || !currentVenueName || addressVenue === currentVenueName
  if (addressMatchesVenue && typeof explicit === 'string' && explicit.trim()) return explicit.trim()

  const parts = [
    event.addressLine1 ?? venue.addressLine1,
    event.addressLine2 ?? venue.addressLine2,
    event.city ?? venue.city,
    event.province ?? venue.province,
    event.country ?? venue.country,
  ].filter((part) => typeof part === 'string' && part.trim())

  return parts.join(', ')
}

function getVenueName(event = {}) {
  if (typeof event.venue === 'string') return event.venue
  return event.venue?.name ?? event.venueName ?? ''
}

export function normalizeMapEvent(event, index = 0) {
  const id = event?.slug ?? event?.id ?? `event-${index}`
  const venue = getVenueName(event)
  const address = getEventAddress(event)
  const mappedVenue = String(event?.addressVenue ?? '')
    .trim()
    .toLocaleLowerCase()
  const venueMatchesMap = !mappedVenue || !venue || mappedVenue === venue.trim().toLocaleLowerCase()

  return {
    id,
    title: event?.title ?? event?.name ?? '',
    date: event?.displayDate ?? event?.date ?? '',
    venue,
    venueRole: event?.venueRole ?? '',
    location: event?.location ?? event?.city ?? '',
    address,
    coordinates: getEventCoordinates(event),
    status: event?.status ?? 'proximamente',
    featured: Boolean(event?.featured),
    mapsUrl: venueMatchesMap ? (event?.mapsUrl ?? event?.mapUrl ?? '') : '',
    source: event,
  }
}

export function normalizeMapEvents(events = []) {
  return events.filter(Boolean).map(normalizeMapEvent)
}

function mapDestination(event) {
  if (!event) return ''
  const normalized = event.source ? event : normalizeMapEvent(event)
  const description = [normalized.address, normalized.venue, normalized.location]
    .filter(Boolean)
    .join(', ')
  if (description) return description
  return normalized.coordinates ? `${normalized.coordinates.lat},${normalized.coordinates.lng}` : ''
}

function coordinateString(value) {
  if (!value) return ''
  const coordinates = getEventCoordinates(value)
  return coordinates ? `${coordinates.lat},${coordinates.lng}` : ''
}

export function buildDirectionsUrl(event, origin) {
  const destination = mapDestination(event)
  if (!destination) return ''
  const originCoordinates = coordinateString(origin)
  const originParameter = originCoordinates
    ? `&origin=${encodeURIComponent(originCoordinates)}`
    : ''
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${originParameter}&travelmode=driving&dir_action=navigate`
}

export function buildExternalMapUrl(event) {
  const normalized = event?.source ? event : normalizeMapEvent(event)
  if (normalized.mapsUrl) return normalized.mapsUrl

  const query = mapDestination(normalized)
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function buildWazeUrl(event) {
  if (!event) return ''
  const normalized = event.source ? event : normalizeMapEvent(event)
  const coordinates = coordinateString(normalized)
  const parameters = coordinates
    ? `ll=${encodeURIComponent(coordinates)}`
    : `q=${encodeURIComponent(mapDestination(normalized))}`
  if (!parameters || parameters === 'q=') return ''
  return `https://waze.com/ul?${parameters}&navigate=yes&utm_source=plu_argentina`
}

export function getMapAvailability({ events = [], online = true } = {}) {
  if (events.length === 0) return 'empty'
  if (!events.some((event) => event.coordinates)) return 'missing_coordinates'
  if (!online) return 'offline'
  return 'ready'
}

export function canUseMapWebGL() {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Embed OSM estático (sin WebGL) para sedes cuando MapLibre no puede cargar. */
export function buildOpenStreetMapEmbedUrl(event, { delta = 0.014 } = {}) {
  const coordinates = event?.coordinates ?? getEventCoordinates(event)
  if (!coordinates) return ''
  const { lat, lng } = coordinates
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
    .map((value) => value.toFixed(6))
    .join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`
}
