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

/** Marcas simplificadas para reconocimiento; no reemplazan assets oficiales. */
function GoogleMapsMark() {
  return (
    <svg className="competition-map__brand-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 2c-3.9 0-7 3.1-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.9-3.1-7-7-7z"
      />
      <circle fill="#fff" cx="12" cy="9" r="2.6" />
      <path fill="#FBBC04" d="M12 2v4.2a2.8 2.8 0 0 1 0 5.6V22s7-7.75 7-13c0-3.9-3.1-7-7-7z" opacity=".9" />
      <path fill="#34A853" d="M12 2C8.1 2 5 5.1 5 9c0 2.4 1.5 5.4 3.4 8.1L12 9.2V2z" opacity=".85" />
      <path fill="#4285F4" d="M12 2v7.2l3.6 7.9C17.5 14.4 19 11.4 19 9c0-3.9-3.1-7-7-7z" opacity=".75" />
    </svg>
  )
}

function WazeMark() {
  return (
    <svg className="competition-map__brand-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#33CCFF"
        d="M12.1 2.2c-4.7 0-8.6 3.5-8.6 8.1 0 2.5 1.1 4.7 2.9 6.2v2.7c0 .4.5.6.8.4l2.4-1.5c.8.2 1.6.3 2.5.3 4.7 0 8.6-3.5 8.6-8.1s-3.9-8.1-8.6-8.1z"
      />
      <circle fill="#1A1A1A" cx="9.2" cy="10.2" r="1.35" />
      <circle fill="#1A1A1A" cx="14.6" cy="10.2" r="1.35" />
      <path
        d="M9.1 13.4c.7.7 1.7 1.1 2.9 1.1s2.2-.4 2.9-1.1"
        fill="none"
        stroke="#1A1A1A"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle fill="#FF3B5C" cx="18.2" cy="8.4" r="1.55" />
    </svg>
  )
}

function ExternalTravelLink({ href, brand, label }) {
  if (!href) return null
  return (
    <a className="competition-map__external-link" href={href} target="_blank" rel="noopener noreferrer">
      <span className="competition-map__external-link-brand" data-brand={brand} aria-hidden>
        {brand === 'google' ? <GoogleMapsMark /> : <WazeMark />}
      </span>
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
        <ExternalTravelLink href={googleUrl} brand="google" label="Google Maps" />
        <ExternalTravelLink href={wazeUrl} brand="waze" label="Waze" />
      </nav>

      <p className="competition-map__travel-privacy">
        {coordinatesAvailable
          ? t('pages.events.map.travel.privacy')
          : t('pages.events.map.travel.coordinatesPending')}
      </p>
    </section>
  )
}
