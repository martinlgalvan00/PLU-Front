import { describe, expect, it } from 'vitest'
import {
  buildDirectionsUrl,
  buildExternalMapUrl,
  buildOpenStreetMapEmbedUrl,
  buildWazeUrl,
  getEventCoordinates,
  getMapAvailability,
  getMapMarkerKind,
  normalizeMapEvents,
} from '../src/lib/eventMap.js'

describe('eventMap', () => {
  it('acepta coordenadas válidas sin alterar el evento fuente', () => {
    const event = {
      slug: 'evento-verificado',
      title: 'Evento verificado',
      coordinates: { lat: -34.6, lng: -58.4 },
    }

    const [normalized] = normalizeMapEvents([event])

    expect(normalized.coordinates).toEqual({ lat: -34.6, lng: -58.4 })
    expect(normalized.source).toBe(event)
  })

  it('rechaza coordenadas incompletas, no numéricas o fuera de rango', () => {
    expect(getEventCoordinates({ latitude: -34.6 })).toBeNull()
    expect(getEventCoordinates({ latitude: 'sur', longitude: -58.4 })).toBeNull()
    expect(getEventCoordinates({ latitude: -91, longitude: -58.4 })).toBeNull()
    expect(getEventCoordinates({ latitude: -34.6, longitude: 181 })).toBeNull()
  })

  it('descarta ubicación heredada cuando ya no corresponde a la sede publicada', () => {
    const event = {
      venue: 'Sede actual',
      addressVenue: 'Sede anterior',
      address: 'Dirección anterior',
      latitude: -34.6,
      longitude: -58.4,
      mapsUrl: 'https://share.google/ubicacion-anterior',
    }

    const [normalized] = normalizeMapEvents([event])

    expect(normalized.address).toBe('')
    expect(normalized.coordinates).toBeNull()
    expect(normalized.mapsUrl).toBe('')
  })

  it('deriva enlaces externos desde la dirección textual sin pedir otra API', () => {
    const event = {
      title: 'Pitbull Classic',
      venue: 'La Troupe Multiespacio',
      address: 'Gallo 148, Banfield',
    }

    expect(buildDirectionsUrl(event)).toContain('maps/dir/?api=1&destination=')
    expect(buildDirectionsUrl(event)).toContain('Gallo%20148%2C%20Banfield')
    expect(buildExternalMapUrl(event)).toContain('maps/search/?api=1&query=')
  })

  it('respeta una URL de Google Maps ya publicada', () => {
    const mapsUrl = 'https://share.google/example'
    expect(buildExternalMapUrl({ title: 'Evento', mapsUrl })).toBe(mapsUrl)
  })

  it('genera enlaces universales de Google Maps y Waze sin claves', () => {
    const event = {
      address: 'Av. Siempre Viva 742',
      coordinates: { lat: -34.6, lng: -58.4 },
      title: 'Evento',
    }

    expect(buildDirectionsUrl(event, { lat: -34.61, lng: -58.41 })).toContain(
      'origin=-34.61%2C-58.41',
    )
    expect(buildDirectionsUrl(event)).toContain('dir_action=navigate')
    expect(buildWazeUrl(event)).toBe(
      'https://waze.com/ul?ll=-34.6%2C-58.4&navigate=yes&utm_source=plu_argentina',
    )
  })

  it('diferencia los estados de datos y configuración', () => {
    const withoutCoordinates = normalizeMapEvents([
      { slug: 'sin-coordenadas', title: 'Sin coordenadas' },
    ])
    const withCoordinates = normalizeMapEvents([
      { slug: 'con-coordenadas', title: 'Con coordenadas', latitude: -34.6, longitude: -58.4 },
    ])

    expect(getMapAvailability({ events: [] })).toBe('empty')
    expect(getMapAvailability({ events: withoutCoordinates })).toBe('missing_coordinates')
    expect(
      getMapAvailability({
        events: withCoordinates,
        online: false,
      }),
    ).toBe('offline')
    expect(getMapAvailability({ events: withCoordinates })).toBe('ready')
  })

  it('activa la cartografía abierta sin credenciales cuando hay coordenadas', () => {
    const events = normalizeMapEvents([
      { slug: 'mapa-libre', title: 'Mapa libre', latitude: -34.6, longitude: -58.4 },
    ])

    expect(getMapAvailability({ events, online: true })).toBe('ready')
  })

  it('arma un embed OSM usable cuando MapLibre no puede inicializar', () => {
    const event = {
      coordinates: { lat: -34.7505701, lng: -58.3937578 },
      title: 'Pitbull Classic',
    }

    const url = buildOpenStreetMapEmbedUrl(event)
    expect(url).toContain('openstreetmap.org/export/embed.html')
    expect(url).toContain('marker=-34.750570%2C-58.393758')
    expect(buildOpenStreetMapEmbedUrl({})).toBe('')
  })

  it('asigna un tratamiento de marcador por jerarquia y estado', () => {
    expect(getMapMarkerKind({ featured: true, status: 'proximamente' })).toBe('featured')
    expect(getMapMarkerKind({ status: 'inscripcion_abierta' })).toBe('open')
    expect(getMapMarkerKind({ status: 'cupos_limitados' })).toBe('limited')
    expect(getMapMarkerKind({ status: 'cerrado' })).toBe('closed')
    expect(getMapMarkerKind({ status: 'finalizado' })).toBe('completed')
    expect(getMapMarkerKind({ status: 'proximamente' })).toBe('upcoming')
  })
})
