import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BadgeCheck,
  CalendarDays,
  LocateFixed,
  LockKeyhole,
  TicketCheck,
  Timer,
  Trophy,
} from 'lucide-react'
import { getMapMarkerKind } from '../../lib/eventMap.js'
import {
  applyPluMapStyle,
  getOpenMapStyleUrl,
  importOpenMapLibrary,
  syncOperationalMapLayers,
} from '../../services/openMapService.js'

const MARKER_ICONS = {
  closed: LockKeyhole,
  completed: BadgeCheck,
  featured: Trophy,
  limited: Timer,
  open: TicketCheck,
  upcoming: CalendarDays,
}

const MARKER_KIND_LABELS = {
  en: {
    closed: 'Registration closed',
    completed: 'Completed',
    featured: 'Featured event',
    limited: 'Limited spots',
    open: 'Registration open',
    upcoming: 'Upcoming',
  },
  es: {
    closed: 'Inscripción cerrada',
    completed: 'Finalizado',
    featured: 'Evento destacado',
    limited: 'Cupos limitados',
    open: 'Inscripción abierta',
    upcoming: 'Próximamente',
  },
}

const MARKER_KIND_CLASSES = Object.keys(MARKER_ICONS).map((kind) => `plu-map-marker--${kind}`)

function markerKindLabel(kind, language) {
  return MARKER_KIND_LABELS[language === 'en' ? 'en' : 'es'][kind]
}

function markerLabel(event, index, selected, language) {
  const selection = language === 'en' ? 'Selected' : 'Seleccionado'
  const order = language === 'en' ? `Event ${index + 1}` : `Evento ${index + 1}`
  const kind = getMapMarkerKind(event)

  return [
    order,
    event.title,
    markerKindLabel(kind, language),
    event.date,
    event.venue || event.location,
    selected ? selection : '',
  ]
    .filter(Boolean)
    .join('. ')
}

function MarkerVisual({ event, index, kind, language }) {
  const Icon = MARKER_ICONS[kind]
  const detail = [markerKindLabel(kind, language), event.date].filter(Boolean).join(' · ')

  return (
    <>
      <span className="plu-map-marker__core" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="plu-map-marker__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="plu-map-marker__label" aria-hidden="true">
        <strong>{event.title}</strong>
        <span>{detail}</span>
      </span>
    </>
  )
}

function syncMarkerButton(record, event, index, selected, language) {
  const kind = getMapMarkerKind(event)
  record.event = event
  record.index = index

  record.button.dataset.markerKind = kind
  MARKER_KIND_CLASSES.forEach((className) => {
    record.button.classList.toggle(className, className === `plu-map-marker--${kind}`)
  })
  record.button.classList.toggle('is-selected', selected)
  record.button.setAttribute('aria-label', markerLabel(event, index, selected, language))
  record.button.setAttribute('aria-pressed', String(selected))
  record.contentRoot.render(
    <MarkerVisual event={event} index={index} kind={kind} language={language} />,
  )
}

function createMarkerRecord(event, index, selected, language) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'plu-map-marker'

  const record = { button, contentRoot: createRoot(button), event, index }
  syncMarkerButton(record, event, index, selected, language)
  return record
}

function lngLat(coordinates) {
  return [coordinates.lng, coordinates.lat]
}

function getMapLocale(language) {
  if (language === 'en') return undefined

  return {
    'AttributionControl.ToggleAttribution': 'Mostrar atribución del mapa',
    'Map.Title': 'Mapa interactivo',
    'Marker.Title': 'Marcador del mapa',
    'NavigationControl.ZoomIn': 'Acercar',
    'NavigationControl.ZoomOut': 'Alejar',
    'CooperativeGesturesHandler.WindowsHelpText':
      'Usá Ctrl y la rueda del mouse para acercar o alejar el mapa',
    'CooperativeGesturesHandler.MacHelpText':
      'Usá ⌘ y la rueda del mouse para acercar o alejar el mapa',
    'CooperativeGesturesHandler.MobileHelpText': 'Usá dos dedos para mover el mapa',
  }
}

export default function OpenMapCanvas({
  events,
  instantSelection = false,
  language = 'es',
  onSelectEvent,
  onStatusChange,
  originLabel,
  parkingLocations = [],
  reducedMotion = false,
  resetLabel,
  route = null,
  selectedEventId,
  theme = 'dark',
  userLocation = null,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const mapLibreRef = useRef(null)
  const markersRef = useRef(new Map())
  const onSelectRef = useRef(onSelectEvent)
  const themeRef = useRef(theme)
  const languageRef = useRef(language)
  const initialEventsRef = useRef(events)
  const initialViewSetRef = useRef(false)
  const lastSelectedEventIdRef = useRef(selectedEventId)
  const lastTravelViewKeyRef = useRef('')
  const travelDataRef = useRef({ parkingLocations, route, userLocation })
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelectEvent
  }, [onSelectEvent])

  const fitAllMarkers = useCallback(() => {
    const map = mapRef.current
    const mapLibre = mapLibreRef.current
    if (!map || !mapLibre || events.length === 0) return

    map.stop()
    if (events.length === 1) {
      map.easeTo({
        center: lngLat(events[0].coordinates),
        duration: reducedMotion ? 0 : 420,
        essential: false,
        zoom: 14.8,
      })
      return
    }

    const bounds = new mapLibre.LngLatBounds()
    events.forEach((event) => bounds.extend(lngLat(event.coordinates)))
    const compact = (containerRef.current?.clientWidth ?? 0) <= 520
    map.fitBounds(bounds, {
      duration: reducedMotion ? 0 : 520,
      essential: false,
      maxZoom: 13,
      padding: compact
        ? { bottom: 72, left: 54, right: 70, top: 96 }
        : { bottom: 64, left: 64, right: 72, top: 88 },
    })
  }, [events, reducedMotion])

  useEffect(() => {
    let active = true
    let loadTimer
    const markerRecords = markersRef.current

    async function initialize() {
      onStatusChange('loading')

      try {
        const mapLibre = await importOpenMapLibrary()
        if (!active || !containerRef.current) return

        const initialEvents = initialEventsRef.current
        const initialCenter = lngLat(initialEvents[0].coordinates)
        mapLibreRef.current = mapLibre

        const map = new mapLibre.Map({
          attributionControl: false,
          center: initialCenter,
          container: containerRef.current,
          cooperativeGestures: true,
          dragRotate: false,
          keyboard: true,
          locale: getMapLocale(languageRef.current),
          maxPitch: 0,
          maxZoom: 18,
          minZoom: 3,
          pitchWithRotate: false,
          renderWorldCopies: false,
          style: getOpenMapStyleUrl(themeRef.current),
          touchPitch: false,
          zoom: initialEvents.length === 1 ? 14.8 : 5,
        })

        map.addControl(new mapLibre.NavigationControl({ showCompass: false }), 'top-right')
        map.addControl(new mapLibre.AttributionControl({ compact: true }), 'bottom-right')

        map.on('style.load', () => {
          applyPluMapStyle(map, containerRef.current, languageRef.current)
          syncOperationalMapLayers(map, containerRef.current, travelDataRef.current)
        })

        map.once('load', () => {
          if (!active) return
          clearTimeout(loadTimer)
          setInitialized(true)
          onStatusChange('loaded')
        })

        loadTimer = window.setTimeout(() => {
          if (active && !map.loaded()) onStatusChange('error')
        }, 12000)

        mapRef.current = map
      } catch {
        if (active) onStatusChange('error')
      }
    }

    void initialize()

    return () => {
      active = false
      clearTimeout(loadTimer)
      markerRecords.forEach(({ button, clickHandler, contentRoot, marker }) => {
        button.removeEventListener('click', clickHandler)
        contentRoot.unmount()
        marker.remove()
      })
      markerRecords.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [onStatusChange])

  useEffect(() => {
    const map = mapRef.current
    if (!initialized || !map || themeRef.current === theme) return

    themeRef.current = theme
    onStatusChange('loading')
    map.setStyle(getOpenMapStyleUrl(theme), { diff: false })
    map.once('style.load', () => {
      applyPluMapStyle(map, containerRef.current, languageRef.current)
      syncOperationalMapLayers(map, containerRef.current, travelDataRef.current)
      onStatusChange('loaded')
    })
  }, [initialized, onStatusChange, theme])

  useEffect(() => {
    languageRef.current = language
    const map = mapRef.current
    if (initialized && map?.isStyleLoaded()) {
      applyPluMapStyle(map, containerRef.current, language)
    }
  }, [initialized, language])

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!initialized || !map || !container || !('ResizeObserver' in window)) return undefined

    let resizeFrame
    const resizeMap = () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => map.resize())
    }
    const observer = new ResizeObserver(resizeMap)
    observer.observe(container)
    resizeMap()
    return () => {
      cancelAnimationFrame(resizeFrame)
      observer.disconnect()
    }
  }, [initialized])

  useEffect(() => {
    const map = mapRef.current
    const mapLibre = mapLibreRef.current
    const travelData = { parkingLocations, route, userLocation }
    travelDataRef.current = travelData
    if (!initialized || !map?.getStyle() || !mapLibre) return

    syncOperationalMapLayers(map, containerRef.current, travelData)

    const routeCoordinates = route?.geometry?.coordinates ?? []
    const parkingCoordinates = parkingLocations.map((parking) => lngLat(parking.coordinates))
    const viewCoordinates = routeCoordinates.length > 1 ? routeCoordinates : parkingCoordinates
    const viewKey =
      routeCoordinates.length > 1
        ? `route:${route.distanceMeters}:${route.durationSeconds}`
        : parkingLocations.length > 0
          ? `parking:${parkingLocations.map((parking) => parking.id).join(',')}`
          : ''
    if (!viewKey || viewKey === lastTravelViewKeyRef.current || viewCoordinates.length === 0) {
      if (!viewKey) lastTravelViewKeyRef.current = ''
      return
    }

    lastTravelViewKeyRef.current = viewKey
    const bounds = new mapLibre.LngLatBounds()
    viewCoordinates.forEach((coordinates) => bounds.extend(coordinates))
    const selected = events.find((event) => event.id === selectedEventId)
    if (routeCoordinates.length <= 1 && selected?.coordinates) {
      bounds.extend(lngLat(selected.coordinates))
    }
    const compact = (containerRef.current?.clientWidth ?? 0) <= 520
    map.stop()
    map.fitBounds(bounds, {
      duration: reducedMotion || instantSelection ? 0 : 520,
      essential: false,
      maxZoom: 15.5,
      padding: compact
        ? { bottom: 68, left: 48, right: 62, top: 112 }
        : { bottom: 62, left: 58, right: 68, top: 132 },
    })
  }, [
    events,
    initialized,
    instantSelection,
    parkingLocations,
    reducedMotion,
    route,
    selectedEventId,
    userLocation,
  ])

  useEffect(() => {
    const map = mapRef.current
    const mapLibre = mapLibreRef.current
    if (!initialized || !map || !mapLibre) return

    const currentIds = new Set(events.map((event) => event.id))
    markersRef.current.forEach(({ button, clickHandler, contentRoot, marker }, id) => {
      if (currentIds.has(id)) return
      button.removeEventListener('click', clickHandler)
      contentRoot.unmount()
      marker.remove()
      markersRef.current.delete(id)
    })

    events.forEach((event, index) => {
      const selected = event.id === selectedEventId
      const existing = markersRef.current.get(event.id)

      if (existing) {
        existing.marker.setLngLat(lngLat(event.coordinates))
        syncMarkerButton(existing, event, index, selected, languageRef.current)
        return
      }

      const record = createMarkerRecord(event, index, selected, languageRef.current)
      const marker = new mapLibre.Marker({
        anchor: 'bottom',
        element: record.button,
      })
        .setLngLat(lngLat(event.coordinates))
        .addTo(map)

      record.marker = marker
      const clickHandler = (interaction) => {
        onSelectRef.current?.(record.event.source, {
          keyboard: interaction.detail === 0,
          origin: 'marker',
        })
      }
      record.clickHandler = clickHandler
      record.button.addEventListener('click', clickHandler)
      markersRef.current.set(event.id, record)
    })

    if (!initialViewSetRef.current) {
      initialViewSetRef.current = true
      if (!travelDataRef.current.route) fitAllMarkers()
    }
  }, [events, fitAllMarkers, initialized, selectedEventId])

  useEffect(() => {
    const map = mapRef.current
    if (!initialized || !map) return

    markersRef.current.forEach((record) => {
      const selected = record.event.id === selectedEventId
      syncMarkerButton(record, record.event, record.index, selected, language)
    })

    const selected = events.find((event) => event.id === selectedEventId)
    const selectionChanged = lastSelectedEventIdRef.current !== selectedEventId
    lastSelectedEventIdRef.current = selectedEventId
    if (!selected || !selectionChanged) return

    map.stop()
    map.easeTo({
      center: lngLat(selected.coordinates),
      duration: reducedMotion || instantSelection ? 0 : 420,
      essential: false,
      zoom: Math.max(map.getZoom(), 14),
    })
  }, [events, initialized, instantSelection, language, reducedMotion, selectedEventId])

  return (
    <div className="competition-map__canvas-shell">
      <div ref={containerRef} className="competition-map__canvas" />
      <p className="competition-map__origin" aria-hidden="true">
        <span />
        {originLabel}
      </p>
      {events.length > 1 ? (
        <button className="competition-map__reset" type="button" onClick={fitAllMarkers}>
          <LocateFixed size={15} aria-hidden />
          {resetLabel}
        </button>
      ) : null}
    </div>
  )
}
