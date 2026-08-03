import openMapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

const OPEN_FREE_MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
}

const MAP_PALETTE_TOKENS = {
  background: '--plu-map-background',
  boundary: '--plu-map-boundary',
  building: '--plu-map-building',
  label: '--plu-map-label',
  labelHalo: '--plu-map-label-halo',
  land: '--plu-map-land',
  motorway: '--plu-map-motorway',
  park: '--plu-map-park',
  parking: '--plu-map-parking',
  parkingText: '--plu-map-parking-text',
  roadMajor: '--plu-map-road-major',
  roadMinor: '--plu-map-road-minor',
  route: '--plu-map-route',
  routeHalo: '--plu-map-route-halo',
  userLocation: '--plu-map-user-location',
  userLocationHalo: '--plu-map-user-location-halo',
  water: '--plu-map-water',
  waterLine: '--plu-map-water-line',
}

let mapLibrePromise = null

function normalizeMapLibreColor(value) {
  const srgb = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/)
  if (!srgb) return value
  const [, red, green, blue, alpha = '1'] = srgb
  return `rgba(${Math.round(Number(red) * 255)}, ${Math.round(Number(green) * 255)}, ${Math.round(Number(blue) * 255)}, ${alpha})`
}

export function getOpenMapStyleUrl(theme) {
  return theme === 'light' ? OPEN_FREE_MAP_STYLES.light : OPEN_FREE_MAP_STYLES.dark
}

export function importOpenMapLibrary() {
  if (!mapLibrePromise) {
    mapLibrePromise = Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
      .then(([module]) => {
        const mapLibre = module.default ?? module
        // Vite empaqueta el worker con todas sus dependencias. Definir la URL
        // explícitamente evita depender de un archivo hermano en producción.
        mapLibre.setWorkerUrl(openMapWorkerUrl)
        return mapLibre
      })
      .catch((error) => {
        mapLibrePromise = null
        throw error
      })
  }

  return mapLibrePromise
}

function readMapPalette(container) {
  const styles = getComputedStyle(container)
  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'display:none;position:absolute'
  container.append(probe)
  const palette = Object.fromEntries(
    Object.entries(MAP_PALETTE_TOKENS).map(([name, token]) => {
      const rawValue = styles.getPropertyValue(token).trim()
      if (!rawValue.includes('color-mix(') && !rawValue.includes('var(')) {
        return [name, rawValue]
      }
      probe.style.color = ''
      probe.style.color = rawValue
      const resolvedValue = getComputedStyle(probe).color
      return [name, normalizeMapLibreColor(resolvedValue || rawValue)]
    }),
  )
  probe.remove()
  return palette
}

function setPaint(map, layerId, property, value) {
  if (!value) return
  try {
    map.setPaintProperty(layerId, property, value)
  } catch {
    // Los estilos upstream pueden cambiar capas sin invalidar el mapa completo.
  }
}

function setLayout(map, layerId, property, value) {
  try {
    map.setLayoutProperty(layerId, property, value)
  } catch {
    // Mantener compatibilidad si OpenFreeMap cambia una capa del estilo base.
  }
}

function fillColorForLayer(layer, palette) {
  const sourceLayer = layer['source-layer']
  if (sourceLayer === 'water') return palette.water
  if (sourceLayer === 'park' || sourceLayer === 'landcover') return palette.park
  if (sourceLayer === 'building') return palette.building
  if (sourceLayer === 'landuse' || sourceLayer === 'aeroway') return palette.land
  return palette.land
}

function lineColorForLayer(layer, palette) {
  const sourceLayer = layer['source-layer']
  if (sourceLayer === 'waterway') return palette.waterLine
  if (sourceLayer === 'boundary') return palette.boundary
  if (sourceLayer !== 'transportation') return palette.roadMinor
  if (layer.id.includes('motorway')) return palette.motorway
  if (layer.id.includes('major')) return palette.roadMajor
  return palette.roadMinor
}

export function applyPluMapStyle(map, container, language = 'es') {
  if (!map?.isStyleLoaded?.() || !container) return

  const palette = readMapPalette(container)
  const layers = map.getStyle()?.layers ?? []
  const localizedName = [
    'coalesce',
    ['get', `name:${language === 'en' ? 'en' : 'es'}`],
    ['get', 'name'],
    ['get', 'name:latin'],
    ['get', 'ref'],
  ]

  layers.forEach((layer) => {
    if (layer.id.startsWith('plu-')) return

    if (layer.type === 'background') {
      setPaint(map, layer.id, 'background-color', palette.background)
      return
    }

    if (layer.type === 'fill') {
      setPaint(map, layer.id, 'fill-color', fillColorForLayer(layer, palette))
      if (layer['source-layer'] === 'building') setPaint(map, layer.id, 'fill-opacity', 0.72)
      return
    }

    if (layer.type === 'line') {
      setPaint(map, layer.id, 'line-color', lineColorForLayer(layer, palette))
      return
    }

    if (layer.type !== 'symbol') return

    const decorativeTransportLabel =
      layer.id.includes('shield') || layer.id === 'airport' || layer.id.includes('airport')
    if (decorativeTransportLabel) {
      setLayout(map, layer.id, 'visibility', 'none')
      return
    }

    if (layer.layout?.['text-field']) {
      setLayout(map, layer.id, 'text-field', localizedName)
      setPaint(map, layer.id, 'text-color', palette.label)
      setPaint(map, layer.id, 'text-halo-color', palette.labelHalo)
      setPaint(map, layer.id, 'text-halo-width', 1)
    }
  })
}

const MAP_DATA_IDS = {
  parking: 'plu-parking-data',
  route: 'plu-route-data',
  user: 'plu-user-location-data',
}

function featureCollection(features = []) {
  return { features, type: 'FeatureCollection' }
}

function pointFeature(coordinates, properties = {}) {
  if (!coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
    return null
  }
  return {
    geometry: { coordinates: [coordinates.lng, coordinates.lat], type: 'Point' },
    properties,
    type: 'Feature',
  }
}

function setGeoJsonData(map, id, data) {
  const source = map.getSource(id)
  if (source?.setData) {
    source.setData(data)
    return
  }
  map.addSource(id, { data, type: 'geojson' })
}

function addLayer(map, layer, beforeId) {
  if (map.getLayer(layer.id)) return
  map.addLayer(layer, beforeId)
}

export function syncOperationalMapLayers(
  map,
  container,
  { parkingLocations = [], route = null, userLocation = null } = {},
) {
  if (!map?.getStyle?.() || !container) return

  const palette = readMapPalette(container)
  const styleLayers = map.getStyle()?.layers ?? []
  const routeAnchor = styleLayers.find(
    (layer) => layer.type === 'symbol' && layer.id.includes('highway_name'),
  )?.id
  const routeFeature =
    route?.geometry?.type === 'LineString' && Array.isArray(route.geometry.coordinates)
      ? {
          geometry: route.geometry,
          properties: {},
          type: 'Feature',
        }
      : null
  const parkingFeatures = parkingLocations
    .map((parking, index) =>
      pointFeature(parking.coordinates, {
        index: index + 1,
        label: 'P',
        name: parking.name || '',
      }),
    )
    .filter(Boolean)
  const userFeature = pointFeature(userLocation, { label: 'Tu ubicación' })

  setGeoJsonData(map, MAP_DATA_IDS.route, featureCollection(routeFeature ? [routeFeature] : []))
  setGeoJsonData(map, MAP_DATA_IDS.parking, featureCollection(parkingFeatures))
  setGeoJsonData(map, MAP_DATA_IDS.user, featureCollection(userFeature ? [userFeature] : []))

  addLayer(
    map,
    {
      id: 'plu-route-halo',
      paint: {
        'line-color': palette.routeHalo,
        'line-opacity': 0.82,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 16, 9],
      },
      source: MAP_DATA_IDS.route,
      type: 'line',
    },
    routeAnchor,
  )
  addLayer(
    map,
    {
      id: 'plu-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.route,
        'line-opacity': 0.96,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 16, 5],
      },
      source: MAP_DATA_IDS.route,
      type: 'line',
    },
    routeAnchor,
  )
  addLayer(map, {
    id: 'plu-parking-points',
    paint: {
      'circle-color': palette.parking,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 8, 16, 11],
      'circle-stroke-color': palette.routeHalo,
      'circle-stroke-width': 2,
    },
    source: MAP_DATA_IDS.parking,
    type: 'circle',
  })
  addLayer(map, {
    id: 'plu-parking-labels',
    layout: {
      'text-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 16, 12],
    },
    paint: { 'text-color': palette.parkingText },
    source: MAP_DATA_IDS.parking,
    type: 'symbol',
  })
  addLayer(map, {
    id: 'plu-user-location-halo',
    paint: {
      'circle-color': palette.userLocationHalo,
      'circle-opacity': 0.28,
      'circle-radius': 15,
    },
    source: MAP_DATA_IDS.user,
    type: 'circle',
  })
  addLayer(map, {
    id: 'plu-user-location',
    paint: {
      'circle-color': palette.userLocation,
      'circle-radius': 6,
      'circle-stroke-color': palette.userLocationHalo,
      'circle-stroke-width': 3,
    },
    source: MAP_DATA_IDS.user,
    type: 'circle',
  })
}
