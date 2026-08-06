import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, MapPin, WifiOff } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import useEventTravelPlanner from '../../hooks/useEventTravelPlanner.js'
import { getMapAvailability, normalizeMapEvents } from '../../lib/eventMap.js'
import { getStatusMeta } from '../../lib/status.js'
import { useTheme } from '../../providers/ThemeProvider.jsx'
import '../../styles/components/competition-map.css'
import EventTravelPlanner from './EventTravelPlanner.jsx'

const OpenMapCanvas = lazy(() => import('./OpenMapCanvas.jsx'))

function useNearViewport(rootMargin = '360px') {
  const ref = useRef(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || nearViewport) return undefined

    if (!('IntersectionObserver' in window)) {
      setNearViewport(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setNearViewport(true)
        observer.disconnect()
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [nearViewport, rootMargin])

  return [ref, nearViewport]
}

function MapFallback({ event, state, hidden, t }) {
  const announcesState = state === 'loading' || state === 'error' || state === 'offline'
  const locationPendingTitle = event?.address
    ? t('pages.events.map.coordinatesTitle')
    : t('pages.events.map.locationTitle')
  const locationPendingCopy = event?.address
    ? t('pages.events.map.coordinatesCopy')
    : t('pages.events.map.locationCopy')
  const content = {
    empty: [t('pages.events.map.emptyTitle'), t('pages.events.map.emptyCopy')],
    missing_coordinates: [locationPendingTitle, locationPendingCopy],
    offline: [t('pages.events.map.offlineTitle'), t('pages.events.map.offlineCopy')],
    error: [t('pages.events.map.errorTitle'), t('pages.events.map.errorCopy')],
    idle: [t('pages.events.map.loadingTitle'), t('pages.events.map.loadingCopy')],
    loading: [t('pages.events.map.loadingTitle'), t('pages.events.map.loadingCopy')],
    ready: [t('pages.events.map.loadingTitle'), t('pages.events.map.loadingCopy')],
  }
  const eyebrows = {
    empty: t('pages.events.map.fallbackEyebrowEmpty'),
    missing_coordinates: t('pages.events.map.fallbackEyebrowPending'),
    offline: t('pages.events.map.fallbackEyebrowOffline'),
    error: t('pages.events.map.fallbackEyebrowError'),
    idle: t('pages.events.map.fallbackEyebrowLoading'),
    loading: t('pages.events.map.fallbackEyebrowLoading'),
    ready: t('pages.events.map.fallbackEyebrowLoading'),
  }
  const [title, copy] = content[state] ?? content.error
  const eyebrow = eyebrows[state] ?? eyebrows.error
  const StateIcon = state === 'offline' ? WifiOff : MapPin
  const venueLine = [event?.venue, event?.location].filter(Boolean).join(' · ')
  const showVenueMeta = state === 'missing_coordinates' && Boolean(venueLine)

  return (
    <div
      className={`competition-map__fallback${hidden ? ' competition-map__fallback--hidden' : ''}`}
      data-state={state}
      aria-hidden={hidden || undefined}
      aria-live={!hidden && announcesState ? 'polite' : undefined}
      role={!hidden && announcesState ? 'status' : undefined}
    >
      <div className="competition-map__fallback-icon" aria-hidden>
        <StateIcon size={16} strokeWidth={1.6} />
      </div>
      <div className="competition-map__fallback-copy">
        <p className="competition-map__fallback-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{copy}</p>
        {showVenueMeta ? <p className="competition-map__fallback-meta">{venueLine}</p> : null}
      </div>
    </div>
  )
}

function MapEventList({ events, labelId, onSelect, reducedMotion, selectedEventId, t }) {
  const listRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    if (!list || !selectedEventId) return

    const selectedButton = Array.from(list.children).find(
      (child) => child.dataset.eventId === String(selectedEventId),
    )
    if (!selectedButton) return

    const listRect = list.getBoundingClientRect()
    const buttonRect = selectedButton.getBoundingClientRect()
    const isVisible = buttonRect.left >= listRect.left && buttonRect.right <= listRect.right
    if (isVisible) return

    const centeredLeft =
      selectedButton.offsetLeft - (list.clientWidth - selectedButton.offsetWidth) / 2
    list.scrollTo({
      behavior: reducedMotion ? 'auto' : 'smooth',
      left: Math.max(0, centeredLeft),
    })
  }, [reducedMotion, selectedEventId])

  return (
    <div className="competition-map__index" aria-labelledby={labelId}>
      <div className="competition-map__index-head">
        <p id={labelId}>{t('pages.events.map.indexTitle')}</p>
        <span>{events.length}</span>
      </div>
      <div ref={listRef} className="competition-map__index-list">
        {events.map((event) => {
          const selected = event.id === selectedEventId
          const { label, tone } = getStatusMeta(event.status, t)
          return (
            <button
              key={event.id}
              className={`competition-map__event${selected ? ' is-selected' : ''}`}
              data-event-id={event.id}
              type="button"
              aria-pressed={selected}
              onClick={(interaction) =>
                onSelect(event.source, { origin: 'list', keyboard: interaction.detail === 0 })
              }
            >
              <span className="competition-map__event-date">{event.date || '—'}</span>
              <span className="competition-map__event-copy">
                <strong>{event.title}</strong>
                <span>{[event.venue, event.location].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="competition-map__event-state" data-tone={tone}>
                <span aria-hidden />
                {label}
              </span>
              {!event.coordinates ? (
                <span className="competition-map__event-data">
                  {t('pages.events.map.locationPending')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Action({ action, className }) {
  if (!action) return null
  const content = (
    <>
      {action.icon}
      <span>{action.label}</span>
      <ArrowRight className="competition-map__action-arrow" size={14} aria-hidden />
    </>
  )

  if (action.href) {
    return (
      <a className={className} href={action.href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }

  return (
    <button className={className} type="button" onClick={action.onClick}>
      {content}
    </button>
  )
}

function SelectedEventPanel({ event, locale, primaryAction, t, travelPlanner }) {
  if (!event) return null

  const { label, tone } = getStatusMeta(event.status, t)

  return (
    <div className="competition-map__selection" aria-live="polite">
      <div className="competition-map__selection-head">
        <p>{event.featured ? t('pages.events.map.featured') : t('pages.events.map.selected')}</p>
        <span className="competition-map__selection-status" data-tone={tone}>
          <span aria-hidden />
          {label}
        </span>
      </div>
      <h3>{event.title}</h3>
      {event.venueRole ? (
        <p className="competition-map__selection-role">{event.venueRole}</p>
      ) : null}
      <dl className="competition-map__selection-meta">
        <div>
          <dt>{t('pages.events.map.date')}</dt>
          <dd>{event.date || '—'}</dd>
        </div>
        <div>
          <dt>{t('pages.events.map.venue')}</dt>
          <dd>{event.venue || t('pages.events.map.venuePending')}</dd>
        </div>
      </dl>
      <p className="competition-map__selection-address">
        <MapPin size={15} aria-hidden />
        <span>{event.address || event.location || t('pages.events.map.locationPending')}</span>
      </p>
      {primaryAction ? (
        <div className="competition-map__actions">
          <Action
            action={primaryAction}
            className="competition-map__action competition-map__action--primary"
          />
        </div>
      ) : null}
      <EventTravelPlanner
        event={event}
        hasPrimaryAction={Boolean(primaryAction)}
        locale={locale}
        onClearParking={travelPlanner.clearParking}
        onRequestParking={travelPlanner.requestParking}
        onRequestRoute={travelPlanner.requestRoute}
        parkingState={travelPlanner.parkingState}
        routeState={travelPlanner.routeState}
        t={t}
        userLocation={travelPlanner.userLocation}
      />
    </div>
  )
}

export default function CompetitionMap({
  className = '',
  description,
  events = [],
  eyebrow,
  featuredEventId,
  onSelectEvent,
  resolvePrimaryAction,
  selectedEventId,
  showHeader = true,
  showList = true,
  title,
  travelService,
  variant = 'calendar',
}) {
  const { locale, t } = useI18n()
  const { theme } = useTheme()
  const titleId = useId()
  const indexLabelId = useId()
  const normalizedEvents = useMemo(
    () =>
      normalizeMapEvents(events).map((event) => ({
        ...event,
        featured: event.featured || event.id === featuredEventId,
      })),
    [events, featuredEventId],
  )
  const resolvedSelectedId = normalizedEvents.some((event) => event.id === selectedEventId)
    ? selectedEventId
    : null
  const selected = normalizedEvents.find((event) => event.id === resolvedSelectedId) ?? null
  const mappedEvents = useMemo(
    () => normalizedEvents.filter((event) => event.coordinates),
    [normalizedEvents],
  )
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [providerState, setProviderState] = useState('idle')
  const [selectionIntent, setSelectionIntent] = useState('pointer')
  const [rootRef, nearViewport] = useNearViewport()
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const availability = getMapAvailability({ events: normalizedEvents, online })
  const shouldLoad = nearViewport && availability === 'ready'
  const fallbackState = availability === 'ready' ? providerState : availability
  const mapVisible = shouldLoad && providerState === 'loaded'
  const travelPlanner = useEventTravelPlanner({
    event: selected,
    online,
    service: travelService,
  })

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const handleSelect = useCallback(
    (event, metadata = {}) => {
      setSelectionIntent(metadata.keyboard ? 'keyboard' : 'pointer')
      onSelectEvent?.(event, metadata)
    },
    [onSelectEvent],
  )

  const handleStatusChange = useCallback((state) => setProviderState(state), [])
  const primaryAction = selected ? resolvePrimaryAction?.(selected.source) : null

  return (
    <section
      ref={rootRef}
      className={`competition-map competition-map--${variant} ${className}`.trim()}
      aria-labelledby={showHeader ? titleId : undefined}
      data-map-provider="openfreemap"
      data-provider-state={fallbackState}
    >
      {showHeader ? (
        <header className="competition-map__header">
          <div>
            <p className="competition-map__eyebrow">
              <MapPin size={14} aria-hidden />
              {eyebrow ?? t('pages.events.map.eyebrow')}
            </p>
            <h2 id={titleId}>{title ?? t('pages.events.map.title')}</h2>
          </div>
          <p>{description ?? t('pages.events.map.description')}</p>
        </header>
      ) : null}

      <div className="competition-map__layout">
        {showList && normalizedEvents.length > 0 ? (
          <MapEventList
            events={normalizedEvents}
            labelId={indexLabelId}
            onSelect={handleSelect}
            reducedMotion={reducedMotion}
            selectedEventId={resolvedSelectedId}
            t={t}
          />
        ) : null}

        <div
          className="competition-map__stage"
          aria-busy={fallbackState === 'loading'}
          aria-label={t('pages.events.map.mapAria')}
          role="region"
        >
          <MapFallback event={selected} state={fallbackState} hidden={mapVisible} t={t} />
          {shouldLoad ? (
            <Suspense fallback={null}>
              <OpenMapCanvas
                events={mappedEvents}
                instantSelection={selectionIntent === 'keyboard'}
                language={locale === 'en' ? 'en' : 'es'}
                onSelectEvent={handleSelect}
                onStatusChange={handleStatusChange}
                originLabel={t('pages.events.map.originLabel')}
                parkingLocations={travelPlanner.parkingState.data?.parking ?? []}
                reducedMotion={reducedMotion}
                resetLabel={t('pages.events.map.resetView')}
                route={travelPlanner.routeState.data}
                selectedEventId={resolvedSelectedId}
                theme={theme}
                userLocation={travelPlanner.userLocation}
              />
            </Suspense>
          ) : null}
        </div>

        <SelectedEventPanel
          event={selected}
          locale={locale}
          primaryAction={primaryAction}
          t={t}
          travelPlanner={travelPlanner}
        />
      </div>
    </section>
  )
}
