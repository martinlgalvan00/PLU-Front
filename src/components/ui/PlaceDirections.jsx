import { MapPin, Navigation } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildPlaceLinks } from '../../lib/eventMap.js'
import '../../styles/components/place-directions.css'

/**
 * "Cómo llegar" con Google Maps y Waze para un lugar sin coordenadas.
 * No dibuja nada si no hay dirección ni nombre.
 */
export default function PlaceDirections({ name, address, city, compact = false }) {
  const { t } = useI18n()
  const links = buildPlaceLinks({ name, address, city })
  if (!links) return null
  return (
    <div className="place-directions" data-compact={compact || undefined}>
      <a
        aria-label={t('common.openInApp', { app: 'Google Maps' })}
        className="place-directions__link"
        href={links.googleMaps}
        rel="noopener noreferrer"
        target="_blank"
      >
        <MapPin aria-hidden size={15} strokeWidth={1.8} />
        Google Maps
      </a>
      <a
        aria-label={t('common.openInApp', { app: 'Waze' })}
        className="place-directions__link"
        href={links.waze}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Navigation aria-hidden size={15} strokeWidth={1.8} />
        Waze
      </a>
    </div>
  )
}
