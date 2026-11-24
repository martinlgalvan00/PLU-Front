import { lazy, Suspense } from 'react'
import { buildExternalMapUrl, buildWazeUrl, getEventCoordinates } from '../../../lib/eventMap.js'
import BlockShell from './BlockShell.jsx'
import PlaceDirections from '../../ui/PlaceDirections.jsx'

// El mapa trae su librería: solo se descarga si la sede tiene coordenadas.
const EventVenueMap = lazy(() => import('../../ui/EventVenueMap.jsx'))

/**
 * Sede: texto propio (slots), dirección y, si hay coordenadas, el mapa. Sin
 * coordenadas pero con dirección, Google Maps y Waze por búsqueda.
 */
export default function LocationBlock({ block, ctx }) {
  const { event, landing, t } = ctx
  const title = landing.slots.locationTitle || event?.venue || ''
  const body = landing.slots.locationBody
  const place = [event?.venue, event?.location].filter(Boolean).join(' · ')
  const hasCoordinates = Boolean(getEventCoordinates(event))
  if (!title && !body && !place) return null

  const venue = {
    name: event?.venue,
    address: event?.address ?? event?.venueAddress,
    locality: event?.location,
    latitude: event?.latitude,
    longitude: event?.longitude,
    mapsUrl: event?.mapsUrl,
  }

  return (
    <BlockShell id={block.id} type="location" title={title || undefined} lead={body ? undefined : place}>
      {body ? <p className="lb-prose">{body}</p> : null}
      {hasCoordinates ? (
        <>
          <div className="lb-map">
            <Suspense fallback={null}>
              <EventVenueMap event={event} role="venue" venue={venue} />
            </Suspense>
          </div>
          <p className="lb-links">
            <a href={buildExternalMapUrl(event)} target="_blank" rel="noreferrer">
              {t('pages.eventBuilder.openMaps')}
            </a>
            <a href={buildWazeUrl(event)} target="_blank" rel="noreferrer">
              {t('pages.eventBuilder.openWaze')}
            </a>
          </p>
        </>
      ) : event?.venueAddress ? (
        // Sin coordenadas pero con dirección cargada: Cómo llegar por búsqueda.
        <>
          <p className="lb-prose">{event.venueAddress}</p>
          <PlaceDirections address={event.venueAddress} city={event?.location} name={event?.venue} />
        </>
      ) : null}
    </BlockShell>
  )
}
