import { describe, expect, it, vi } from 'vitest'
import {
  applyPluMapStyle,
  createOpenMapTransformRequest,
  getOpenMapStyleUrl,
  syncOperationalMapLayers,
} from '../src/services/openMapService.js'

const palette = {
  '--plu-map-background': '#101010',
  '--plu-map-boundary': '#202020',
  '--plu-map-building': '#303030',
  '--plu-map-label': '#404040',
  '--plu-map-label-halo': '#505050',
  '--plu-map-land': '#606060',
  '--plu-map-motorway': '#707070',
  '--plu-map-park': '#808080',
  '--plu-map-parking': '#818181',
  '--plu-map-parking-text': '#828282',
  '--plu-map-road-major': '#909090',
  '--plu-map-road-minor': '#a0a0a0',
  '--plu-map-route': '#a1a1a1',
  '--plu-map-route-halo': '#a2a2a2',
  '--plu-map-user-location': '#a3a3a3',
  '--plu-map-user-location-halo': '#a4a4a4',
  '--plu-map-water': '#b0b0b0',
  '--plu-map-water-line': '#c0c0c0',
}

describe('openMapService', () => {
  it('usa estilos abiertos sin parámetros de credenciales', () => {
    expect(getOpenMapStyleUrl('light')).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(getOpenMapStyleUrl('dark')).toBe('https://tiles.openfreemap.org/styles/dark')
    expect(getOpenMapStyleUrl('dark')).not.toContain('key=')
  })

  it('reescribe assets de OpenFreeMap al proxy same-origin', () => {
    const transformRequest = createOpenMapTransformRequest()
    const origin = window.location.origin
    expect(transformRequest('https://tiles.openfreemap.org/styles/dark')).toEqual({
      url: `${origin}/map-tiles/styles/dark`,
    })
    expect(
      transformRequest('https://tiles.openfreemap.org/planet/20260802_080001_pt/14/5534/9880.pbf'),
    ).toEqual({
      url: `${origin}/map-tiles/planet/20260802_080001_pt/14/5534/9880.pbf`,
    })
    expect(transformRequest('https://router.project-osrm.org/route/v1/driving/0,0;1,1')).toEqual({
      url: 'https://router.project-osrm.org/route/v1/driving/0,0;1,1',
    })
  })

  it('aplica la paleta PLU y localiza etiquetas sobre el estilo vectorial', () => {
    const container = document.createElement('div')
    Object.entries(palette).forEach(([token, value]) => container.style.setProperty(token, value))
    document.body.append(container)

    const map = {
      getStyle: () => ({
        layers: [
          { id: 'background', type: 'background' },
          { id: 'water', type: 'fill', 'source-layer': 'water' },
          { id: 'highway_motorway_inner', type: 'line', 'source-layer': 'transportation' },
          {
            id: 'label_city',
            layout: { 'text-field': ['get', 'name'] },
            type: 'symbol',
          },
        ],
      }),
      isStyleLoaded: () => true,
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    }

    applyPluMapStyle(map, container, 'es')

    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', '#101010')
    expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', '#b0b0b0')
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'highway_motorway_inner',
      'line-color',
      '#707070',
    )
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'label_city',
      'text-field',
      expect.arrayContaining([expect.arrayContaining(['get', 'name:es'])]),
    )

    container.remove()
  })

  it('dibuja ruta, ubicación y estacionamientos como capas de datos separadas', () => {
    const container = document.createElement('div')
    Object.entries(palette).forEach(([token, value]) => container.style.setProperty(token, value))
    document.body.append(container)
    const sources = new Map()
    const layers = new Map()
    const map = {
      addLayer: vi.fn((layer) => layers.set(layer.id, layer)),
      addSource: vi.fn((id, source) => sources.set(id, { ...source, setData: vi.fn() })),
      getLayer: (id) => layers.get(id),
      getSource: (id) => sources.get(id),
      getStyle: () => ({ layers: [{ id: 'labels', type: 'symbol' }] }),
      isStyleLoaded: () => true,
    }

    syncOperationalMapLayers(map, container, {
      parkingLocations: [
        { coordinates: { lat: -34.61, lng: -58.41 }, id: 'parking-1', name: 'Parking' },
      ],
      route: {
        geometry: {
          coordinates: [
            [-58.4, -34.6],
            [-58.41, -34.61],
          ],
          type: 'LineString',
        },
      },
      userLocation: { lat: -34.6, lng: -58.4 },
    })

    expect(sources.has('plu-route-data')).toBe(true)
    expect(sources.has('plu-parking-data')).toBe(true)
    expect(sources.has('plu-user-location-data')).toBe(true)
    expect(layers.has('plu-route')).toBe(true)
    expect(layers.has('plu-parking-labels')).toBe(true)
    expect(layers.has('plu-user-location')).toBe(true)
    container.remove()
  })
})
