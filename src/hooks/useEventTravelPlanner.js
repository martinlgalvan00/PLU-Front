import { useCallback, useEffect, useRef, useState } from 'react'
import defaultTravelService from '../services/eventTravelService.js'

const idleState = { data: null, errorCode: '', status: 'idle' }

function errorCode(error, fallback) {
  if (error?.name === 'AbortError') return 'aborted'
  return error?.code || fallback
}

export default function useEventTravelPlanner({ event, online, service = defaultTravelService }) {
  const [routeState, setRouteState] = useState(idleState)
  const [parkingState, setParkingState] = useState(idleState)
  const [userLocation, setUserLocation] = useState(null)
  const routeAbortRef = useRef(null)
  const parkingAbortRef = useRef(null)
  const eventVersionRef = useRef(0)
  const routeVersionRef = useRef(0)
  const parkingVersionRef = useRef(0)
  const eventId = event?.id ?? ''

  useEffect(() => {
    eventVersionRef.current += 1
    routeVersionRef.current += 1
    parkingVersionRef.current += 1
    routeAbortRef.current?.abort()
    parkingAbortRef.current?.abort()
    setRouteState(idleState)
    setParkingState(idleState)
    setUserLocation(null)
  }, [eventId])

  useEffect(
    () => () => {
      routeAbortRef.current?.abort()
      parkingAbortRef.current?.abort()
    },
    [],
  )

  const requestRoute = useCallback(async () => {
    if (!event?.coordinates) return
    if (!online) {
      setRouteState({ data: null, errorCode: 'offline', status: 'error' })
      return
    }

    routeAbortRef.current?.abort()
    const controller = new AbortController()
    routeAbortRef.current = controller
    const eventVersion = eventVersionRef.current
    const requestVersion = ++routeVersionRef.current
    setRouteState({ data: null, errorCode: '', status: 'loading' })

    try {
      const location = await service.getCurrentLocation()
      if (eventVersion !== eventVersionRef.current || requestVersion !== routeVersionRef.current)
        return
      setUserLocation(location)
      const route = await service.getDrivingRoute(location, event.coordinates, {
        signal: controller.signal,
      })
      if (eventVersion !== eventVersionRef.current || requestVersion !== routeVersionRef.current)
        return
      setRouteState({ data: route, errorCode: '', status: 'success' })
    } catch (error) {
      if (
        eventVersion !== eventVersionRef.current ||
        requestVersion !== routeVersionRef.current ||
        error?.name === 'AbortError'
      )
        return
      setRouteState({
        data: null,
        errorCode: errorCode(error, 'route_unavailable'),
        status: 'error',
      })
    }
  }, [event, online, service])

  const requestParking = useCallback(async () => {
    if (!event?.coordinates) return
    if (!online) {
      setParkingState({ data: null, errorCode: 'offline', status: 'error' })
      return
    }

    parkingAbortRef.current?.abort()
    const controller = new AbortController()
    parkingAbortRef.current = controller
    const eventVersion = eventVersionRef.current
    const requestVersion = ++parkingVersionRef.current
    setParkingState({ data: null, errorCode: '', status: 'loading' })

    try {
      const parking = await service.getNearbyParking(event.coordinates, {
        signal: controller.signal,
      })
      if (eventVersion !== eventVersionRef.current || requestVersion !== parkingVersionRef.current)
        return
      setParkingState({ data: parking, errorCode: '', status: 'success' })
    } catch (error) {
      if (
        eventVersion !== eventVersionRef.current ||
        requestVersion !== parkingVersionRef.current ||
        error?.name === 'AbortError'
      )
        return
      setParkingState({
        data: null,
        errorCode: errorCode(error, 'parking_unavailable'),
        status: 'error',
      })
    }
  }, [event, online, service])

  const clearParking = useCallback(() => {
    parkingVersionRef.current += 1
    parkingAbortRef.current?.abort()
    setParkingState(idleState)
  }, [])

  return {
    clearParking,
    parkingState,
    requestParking,
    requestRoute,
    routeState,
    userLocation,
  }
}
