import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import CompetitionMap from './CompetitionMap.jsx'
import { UPCOMING_EVENTS } from '../../lib/events.js'

const mapDataFields = new Set([
  'coordinateVenue',
  'coordinates',
  'lat',
  'latitude',
  'lng',
  'longitude',
])
const eventsWithoutCoordinates = UPCOMING_EVENTS.map((event) =>
  Object.fromEntries(Object.entries(event).filter(([field]) => !mapDataFields.has(field))),
)

const markerDemoEvents = [
  {
    id: 'demo-featured',
    title: 'Demo destacado',
    date: '12 dic',
    venue: 'Sede de prueba 01',
    coordinates: { lat: -34.6037, lng: -58.3816 },
    status: 'proximamente',
    featured: true,
  },
  {
    id: 'demo-open',
    title: 'Demo inscripción',
    date: '18 ene',
    venue: 'Sede de prueba 02',
    address: 'Av. de prueba 1200, Buenos Aires',
    coordinates: { lat: -34.6158, lng: -58.4333 },
    status: 'inscripcion_abierta',
  },
  {
    id: 'demo-limited',
    title: 'Demo cupos',
    date: '02 feb',
    venue: 'Sede de prueba 03',
    coordinates: { lat: -34.6345, lng: -58.3631 },
    status: 'cupos_limitados',
  },
  {
    id: 'demo-completed',
    title: 'Demo finalizado',
    date: '09 mar',
    venue: 'Sede de prueba 04',
    coordinates: { lat: -34.5764, lng: -58.4216 },
    status: 'finalizado',
  },
]

const travelDemoService = {
  getCurrentLocation: async () => ({ accuracy: 28, lat: -34.6484, lng: -58.4166 }),
  getDrivingRoute: async (origin, destination) => ({
    destination,
    distanceMeters: 8400,
    durationSeconds: 1320,
    geometry: {
      coordinates: [
        [origin.lng, origin.lat],
        [-58.4382, -34.631],
        [destination.lng, destination.lat],
      ],
      type: 'LineString',
    },
    origin,
    provider: 'OSRM',
  }),
  getNearbyParking: async (center) => ({
    center,
    parking: [
      {
        capacity: '42',
        coordinates: { lat: -34.6144, lng: -58.4308 },
        distanceMeters: 260,
        fee: 'yes',
        id: 'demo-parking-01',
        name: 'Estacionamiento demo norte',
      },
      {
        capacity: '',
        coordinates: { lat: -34.6182, lng: -58.4356 },
        distanceMeters: 410,
        fee: '',
        id: 'demo-parking-02',
        name: 'Estacionamiento demo sur',
      },
    ],
    provider: 'OpenStreetMap',
    radiusMeters: 1200,
  }),
}

function MarkerDemoStory(args) {
  const [selectedEventId, setSelectedEventId] = useState(args.selectedEventId)

  return (
    <CompetitionMap
      {...args}
      onSelectEvent={(event) => setSelectedEventId(event.id ?? event.slug)}
      selectedEventId={selectedEventId}
    />
  )
}

export default {
  title: 'UI/CompetitionMap',
  component: CompetitionMap,
  parameters: { layout: 'padded' },
}

export const MarcadoresPorEstado = {
  args: {
    events: markerDemoEvents,
    featuredEventId: 'demo-featured',
    selectedEventId: 'demo-featured',
  },
  render: (args) => <MarkerDemoStory {...args} />,
}

export const PlanificacionDeLlegada = {
  args: {
    events: [markerDemoEvents[1]],
    selectedEventId: 'demo-open',
    showList: false,
    travelService: travelDemoService,
    variant: 'venue',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /calcular desde mi ubicación/i }))
    await expect(await canvas.findByText(/8,4 km · 22 min/i)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /ver estacionamientos cercanos/i }))
    await expect(await canvas.findByText(/2 opciones registradas/i)).toBeVisible()
    await expect(canvas.getByRole('link', { name: /google maps/i })).toHaveAttribute(
      'href',
      expect.stringContaining('origin='),
    )
    await expect(canvas.getByRole('link', { name: /waze/i })).toHaveAttribute(
      'href',
      expect.stringContaining('navigate=yes'),
    )
  },
  render: (args) => <MarkerDemoStory {...args} />,
}

export const FallbackSinCoordenadas = {
  args: {
    events: eventsWithoutCoordinates,
    selectedEventId: 'pitbull-classic-2026',
  },
}

export const SinEventos = {
  args: {
    events: [],
  },
}
