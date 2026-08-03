const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org'
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const PARKING_CACHE_TTL = 15 * 60 * 1000
const ROUTE_CACHE_TTL = 5 * 60 * 1000

const responseCache = new Map()

function serviceError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function validPoint(point) {
  const lat = Number(point?.lat)
  const lng = Number(point?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function readCache(key) {
  const cached = responseCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key)
    return null
  }
  return cached.value
}

function writeCache(key, value, ttl) {
  responseCache.set(key, { expiresAt: Date.now() + ttl, value })
  return value
}

async function fetchJson(url, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw serviceError('provider_unavailable', 'Fetch is not available')
  }

  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw serviceError('provider_unavailable', `Map provider responded with ${response.status}`)
  }
  return response.json()
}

function pointCacheKey(point, precision = 4) {
  return `${point.lat.toFixed(precision)},${point.lng.toFixed(precision)}`
}

export function getCurrentLocation({
  geolocation = globalThis.navigator?.geolocation,
  maximumAge = 5 * 60 * 1000,
  timeout = 10000,
} = {}) {
  if (!geolocation?.getCurrentPosition) {
    return Promise.reject(serviceError('geolocation_unsupported', 'Geolocation is not supported'))
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = validPoint({ lat: coords.latitude, lng: coords.longitude })
        if (!point) {
          reject(serviceError('position_unavailable', 'The browser returned an invalid location'))
          return
        }
        resolve({ ...point, accuracy: Number(coords.accuracy) || null })
      },
      (error) => {
        const code =
          error?.code === 1
            ? 'permission_denied'
            : error?.code === 3
              ? 'geolocation_timeout'
              : 'position_unavailable'
        reject(serviceError(code, error?.message || 'Unable to read the current location'))
      },
      { enableHighAccuracy: false, maximumAge, timeout },
    )
  })
}

export async function getDrivingRoute(
  originValue,
  destinationValue,
  { baseUrl = import.meta.env.VITE_OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL, fetchImpl, signal } = {},
) {
  const origin = validPoint(originValue)
  const destination = validPoint(destinationValue)
  if (!origin || !destination) {
    throw serviceError('invalid_coordinates', 'A valid origin and destination are required')
  }

  const cacheKey = `route:${pointCacheKey(origin)}:${pointCacheKey(destination)}`
  const cached = readCache(cacheKey)
  if (cached) return cached

  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  const url = new URL(`/route/v1/driving/${coordinates}`, baseUrl)
  url.searchParams.set('alternatives', 'false')
  url.searchParams.set('geometries', 'geojson')
  url.searchParams.set('overview', 'full')
  url.searchParams.set('steps', 'false')

  const payload = await fetchJson(url, { fetchImpl, signal })
  const route = payload?.code === 'Ok' ? payload.routes?.[0] : null
  if (!route?.geometry || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw serviceError('route_unavailable', 'No driving route was returned')
  }

  return writeCache(
    cacheKey,
    {
      destination,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
      origin,
      provider: 'OSRM',
    },
    ROUTE_CACHE_TTL,
  )
}

export function distanceBetweenPoints(firstValue, secondValue) {
  const first = validPoint(firstValue)
  const second = validPoint(secondValue)
  if (!first || !second) return null

  const radians = (degrees) => (degrees * Math.PI) / 180
  const earthRadius = 6371000
  const latitudeDelta = radians(second.lat - first.lat)
  const longitudeDelta = radians(second.lng - first.lng)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parkingPoint(element) {
  return validPoint({
    lat: element?.lat ?? element?.center?.lat,
    lng: element?.lon ?? element?.center?.lon,
  })
}

export async function getNearbyParking(
  centerValue,
  {
    fetchImpl,
    radius = 1200,
    signal,
    url = import.meta.env.VITE_OVERPASS_API_URL || DEFAULT_OVERPASS_URL,
  } = {},
) {
  const center = validPoint(centerValue)
  if (!center) throw serviceError('invalid_coordinates', 'A valid event location is required')

  const safeRadius = Math.min(2000, Math.max(400, Math.round(radius)))
  const cacheKey = `parking:${pointCacheKey(center, 3)}:${safeRadius}`
  const cached = readCache(cacheKey)
  if (cached) return cached

  const query = `[out:json][timeout:12];(nwr(around:${safeRadius},${center.lat},${center.lng})["amenity"="parking"]["access"!~"^(private|no)$"];);out center tags;`
  const endpoint = new URL(url)
  endpoint.searchParams.set('data', query)
  const payload = await fetchJson(endpoint, { fetchImpl, signal })

  const parking = (payload?.elements ?? [])
    .map((element) => {
      if (element.tags?.access === 'private' || element.tags?.access === 'no') return null
      const coordinates = parkingPoint(element)
      if (!coordinates) return null
      const distanceMeters = distanceBetweenPoints(center, coordinates)
      if (distanceMeters == null || distanceMeters > safeRadius + 25) return null
      return {
        access: element.tags?.access ?? '',
        capacity: element.tags?.capacity ?? '',
        coordinates,
        distanceMeters,
        fee: element.tags?.fee ?? '',
        id: `${element.type}-${element.id}`,
        name: element.tags?.name ?? '',
        parkingType: element.tags?.parking ?? '',
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
    .slice(0, 12)

  return writeCache(
    cacheKey,
    { center, parking, provider: 'OpenStreetMap', radiusMeters: safeRadius },
    PARKING_CACHE_TTL,
  )
}

const eventTravelService = {
  getCurrentLocation,
  getDrivingRoute,
  getNearbyParking,
}

export default eventTravelService
