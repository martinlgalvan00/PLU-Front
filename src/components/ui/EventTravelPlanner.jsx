import {
  CarFront,
  CircleParking,
  ExternalLink,
  LocateFixed,
  MapPinned,
  Navigation,
} from 'lucide-react'
import { buildDirectionsUrl, buildWazeUrl } from '../../lib/eventMap.js'

function formatDistance(meters, locale) {
  if (!Number.isFinite(meters)) return ''
  if (meters < 1000) return `${Math.max(1, Math.round(meters / 10) * 10)} m`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`
}

function formatDuration(seconds, t) {
  if (!Number.isFinite(seconds)) return ''
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return t('pages.events.map.travel.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes
    ? t('pages.events.map.travel.hoursMinutes', { hours, minutes: remainingMinutes })
    : t('pages.events.map.travel.hours', { count: hours })
}

function errorMessage(errorCode, t) {
  const messages = {
    geolocation_timeout: 'locationTimeout',
    geolocation_unsupported: 'locationUnsupported',
    offline: 'offline',
    parking_unavailable: 'parkingUnavailable',
    permission_denied: 'locationDenied',
    position_unavailable: 'locationUnavailable',
    provider_unavailable: 'providerUnavailable',
    route_unavailable: 'routeUnavailable',
  }
  return t(`pages.events.map.travel.${messages[errorCode] ?? 'providerUnavailable'}`)
}

function ExternalTravelLink({ href, icon, label }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {icon}
      <span>{label}</span>
      <ExternalLink size={13} aria-hidden />
    </a>
  )
}

export default function EventTravelPlanner({
  event,
  hasPrimaryAction,
  locale,
  parkingState,
  onClearParking,
  onRequestParking,
  onRequestRoute,
  routeState,
  t,
  userLocation,
}) {
  const numberLocale = locale === 'en' ? 'en-US' : 'es-AR'
  const coordinatesAvailable = Boolean(event?.coordinates)
  const parkingVisible = parkingState.status === 'success'
  const googleUrl = buildDirectionsUrl(event, userLocation)
  const wazeUrl = buildWazeUrl(event)
  const routeSummary = routeState.data
    ? [
        formatDistance(routeState.data.distanceMeters, numberLocale),
        formatDuration(routeState.data.durationSeconds, t),
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <section
      className={`competition-map__travel${coordinatesAvailable ? '' : ' competition-map__travel--external-only'}`}
      aria-labelledby={`travel-${event.id}`}
    >
      <div className="competition-map__travel-head">
        <div>
          <p>
            <Navigation size={14} aria-hidden />
            {t('pages.events.map.travel.eyebrow')}
          </p>
          <h4 id={`travel-${event.id}`}>{t('pages.events.map.travel.title')}</h4>
        </div>
        {coordinatesAvailable ? <span>{t('pages.events.map.travel.openData')}</span> : null}
      </div>

      <p className="competition-map__travel-lead">
        {coordinatesAvailable
          ? t('pages.events.map.travel.description')
          : t('pages.events.map.travel.externalOnlyDescription')}
      </p>

      {coordinatesAvailable ? (
        <div className="competition-map__travel-tools">
          <button
            className="competition-map__travel-action"
            data-dominant={!hasPrimaryAction || undefined}
            type="button"
            disabled={routeState.status === 'loading'}
            onClick={onRequestRoute}
          >
            <LocateFixed size={16} aria-hidden />
            <span>
              {routeState.status === 'loading'
                ? t('pages.events.map.travel.calculating')
                : t('pages.events.map.travel.calculate')}
            </span>
          </button>
          <button
            className="competition-map__travel-action"
            type="button"
            aria-pressed={parkingVisible}
            disabled={parkingState.status === 'loading'}
            onClick={parkingVisible ? onClearParking : onRequestParking}
          >
            <CircleParking size={17} aria-hidden />
            <span>
              {parkingState.status === 'loading'
                ? t('pages.events.map.travel.parkingLoading')
                : parkingVisible
                  ? t('pages.events.map.travel.parkingHide')
                  : t('pages.events.map.travel.parkingShow')}
            </span>
          </button>
        </div>
      ) : null}

      <div className="competition-map__travel-feedback" aria-live="polite">
        {routeState.status === 'success' ? (
          <div className="competition-map__route-summary">
            <CarFront size={18} aria-hidden />
            <span>
              <strong>{routeSummary}</strong>
              <small>{t('pages.events.map.travel.routeEstimate')}</small>
            </span>
          </div>
        ) : null}
        {routeState.status === 'error' ? (
          <p className="competition-map__travel-message" data-tone="error">
            {errorMessage(routeState.errorCode, t)}
          </p>
        ) : null}

        {parkingState.status === 'success' ? (
          <div className="competition-map__parking-results">
            <p>
              {parkingState.data.parking.length > 0
                ? t('pages.events.map.travel.parkingSummary', {
                    count: parkingState.data.parking.length,
                    radius: formatDistance(parkingState.data.radiusMeters, numberLocale),
                  })
                : t('pages.events.map.travel.parkingEmpty', {
                    radius: formatDistance(parkingState.data.radiusMeters, numberLocale),
                  })}
            </p>
            {parkingState.data.parking.length > 0 ? (
              <ol>
                {parkingState.data.parking.slice(0, 3).map((parking, index) => (
                  <li key={parking.id}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>
                        {parking.name ||
                          t('pages.events.map.travel.parkingFallback', { count: index + 1 })}
                      </strong>
                      <small>
                        {[
                          formatDistance(parking.distanceMeters, numberLocale),
                          parking.capacity
                            ? t('pages.events.map.travel.parkingCapacity', {
                                count: parking.capacity,
                              })
                            : '',
                          parking.fee === 'yes' ? t('pages.events.map.travel.parkingFee') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            <small className="competition-map__parking-note">
              {t('pages.events.map.travel.parkingDisclaimer')}
            </small>
          </div>
        ) : null}
        {parkingState.status === 'error' ? (
          <p className="competition-map__travel-message" data-tone="error">
            {errorMessage(parkingState.errorCode, t)}
          </p>
        ) : null}
      </div>

      <nav
        className="competition-map__external-travel"
        aria-label={t('pages.events.map.travel.externalAria')}
      >
        <span>
          <MapPinned size={14} aria-hidden />
          {t('pages.events.map.travel.openWith')}
        </span>
        <ExternalTravelLink
          href={googleUrl}
          icon={<MapPinned size={15} aria-hidden />}
          label="Google Maps"
        />
        <ExternalTravelLink
          href={wazeUrl}
          icon={<Navigation size={15} aria-hidden />}
          label="Waze"
        />
      </nav>

      <p className="competition-map__travel-privacy">
        {coordinatesAvailable
          ? t('pages.events.map.travel.privacy')
          : t('pages.events.map.travel.coordinatesPending')}
      </p>
    </section>
  )
}
