import { describe, expect, it, vi } from 'vitest'
import {
  distanceBetweenPoints,
  getCurrentLocation,
  getDrivingRoute,
  getNearbyParking,
} from '../src/services/eventTravelService.js'

function jsonResponse(payload, status = 200) {
  return {
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
  }
}

describe('eventTravelService', () => {
  it('solicita la ubicación al navegador sin persistirla', async () => {
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { accuracy: 25, latitude: -34.6, longitude: -58.4 } })
    })

    await expect(getCurrentLocation({ geolocation: { getCurrentPosition } })).resolves.toEqual({
      accuracy: 25,
      lat: -34.6,
      lng: -58.4,
    })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('distingue el rechazo de permisos de geolocalización', async () => {
    const geolocation = {
      getCurrentPosition: (_success, error) => error({ code: 1, message: 'denied' }),
    }

    await expect(getCurrentLocation({ geolocation })).rejects.toMatchObject({
      code: 'permission_denied',
    })
  })

  it('normaliza una ruta vial GeoJSON de OSRM', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          code: 'Ok',
          routes: [
            {
              distance: 8400,
              duration: 1320,
              geometry: {
                coordinates: [
                  [-58.4, -34.6],
                  [-58.43, -34.61],
                ],
                type: 'LineString',
              },
            },
          ],
        }),
      ),
    )

    const route = await getDrivingRoute(
      { lat: -34.6001, lng: -58.4001 },
      { lat: -34.6101, lng: -58.4301 },
      { baseUrl: 'https://router.example.test', fetchImpl },
    )

    expect(route).toMatchObject({ distanceMeters: 8400, durationSeconds: 1320 })
    expect(route.geometry.type).toBe('LineString')
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/route/v1/driving/')
    expect(String(fetchImpl.mock.calls[0][0])).toContain('geometries=geojson')
  })

  it('ordena estacionamientos registrados por cercanía y excluye accesos privados', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          elements: [
            {
              id: 3,
              lat: -34.602,
              lon: -58.4,
              tags: { access: 'private', amenity: 'parking', name: 'Privado' },
              type: 'node',
            },
            {
              center: { lat: -34.605, lon: -58.4 },
              id: 2,
              tags: { amenity: 'parking', name: 'Más lejano' },
              type: 'way',
            },
            {
              id: 1,
              lat: -34.601,
              lon: -58.4,
              tags: { amenity: 'parking', capacity: '20', name: 'Más cercano' },
              type: 'node',
            },
          ],
        }),
      ),
    )

    const result = await getNearbyParking(
      { lat: -34.6, lng: -58.4 },
      { fetchImpl, radius: 1200, url: 'https://overpass.example.test/api/interpreter' },
    )

    expect(result.parking.map((parking) => parking.name)).toEqual(['Más cercano', 'Más lejano'])
    expect(result.parking[0].capacity).toBe('20')
    expect(String(fetchImpl.mock.calls[0][0])).toContain('amenity')
  })

  it('calcula distancias lineales para ordenar datos cercanos', () => {
    expect(
      distanceBetweenPoints({ lat: -34.6, lng: -58.4 }, { lat: -34.601, lng: -58.4 }),
    ).toBeCloseTo(111, 0)
  })
})
