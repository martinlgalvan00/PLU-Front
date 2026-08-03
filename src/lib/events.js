export const EVENT_STATUS = {
  proximamente: { label: 'Próximamente', tone: 'neutral' },
  inscripcion_abierta: { label: 'Inscripción abierta', tone: 'success' },
  cupos_limitados: { label: 'Cupos limitados', tone: 'warning' },
  cerrado: { label: 'Cerrado', tone: 'danger' },
  finalizado: { label: 'Finalizado', tone: 'neutral' },
}

export const PITBULL_VENUE_DATA = {
  name: 'La Troupe Multiespacio',
  street: 'Gallo 148',
  locality: 'B1832 Banfield, Provincia de Buenos Aires',
  address: 'Gallo 148, B1832 Banfield, Provincia de Buenos Aires',
  latitude: -34.7505701,
  longitude: -58.3937578,
  coordinatesSource: 'OpenStreetMap Nominatim · place 17826083 · verificado 2026-08-02',
  mapsUrl: 'https://share.google/PBjQQ9rOQqNpVXv1B',
}

export const UPCOMING_EVENTS = [
  {
    date: '12-13 Dic',
    dateISO: '2026-12-12',
    title: 'Pitbull Classic',
    venue: PITBULL_VENUE_DATA.name,
    location: 'Banfield, Buenos Aires',
    address: PITBULL_VENUE_DATA.address,
    addressVenue: PITBULL_VENUE_DATA.name,
    coordinateVenue: PITBULL_VENUE_DATA.name,
    latitude: PITBULL_VENUE_DATA.latitude,
    longitude: PITBULL_VENUE_DATA.longitude,
    mapsUrl: PITBULL_VENUE_DATA.mapsUrl,
    slug: 'pitbull-classic-2026',
    status: 'proximamente',
    featured: true,
    requiresMembership: true,
    startsAt: '2026-12-12T09:00:00-03:00',
    endsAt: '2026-12-13T20:00:00-03:00',
    description:
      'Pitbull Classic · meet oficial PLU Argentina. La Troupe Multiespacio, Gallo 148, Banfield.',
  },
  {
    date: '18 May',
    dateISO: '2025-05-18',
    title: 'Spring Classic 2025',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    slug: 'spring-classic-2025',
    status: 'finalizado',
    requiresMembership: false,
  },
]
