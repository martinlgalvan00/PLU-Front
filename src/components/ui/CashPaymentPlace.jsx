import { Clock, MapPin, UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import PlaceDirections from './PlaceDirections.jsx'
import '../../styles/components/cash-payment-place.css'

/**
 * Dónde se paga en efectivo: lugar, dirección, horario y a quién buscar, con
 * Google Maps y Waze. Antes era una oración ("Pagá en efectivo en …") y el
 * atleta tenía que adivinar la dirección y el horario.
 *
 * `cashPayment` llega resuelto del servidor (lugar propio o la sede).
 */
export default function CashPaymentPlace({ cashPayment, event = null, fallback = '' }) {
  const { t } = useI18n()
  const place =
    cashPayment?.place || [event?.venue, event?.location].filter(Boolean).join(' · ') || fallback
  const address = cashPayment?.address || ''
  const hours = cashPayment?.hours || ''
  const contact = cashPayment?.contact || ''
  const notes = cashPayment?.notes || ''
  if (!place && !address) return null

  return (
    <section className="cash-place" aria-label={t('pages.register.cashPlaceTitle')}>
      <p className="cash-place__eyebrow">{t('pages.register.cashPlaceTitle')}</p>
      <p className="cash-place__name">{place}</p>
      <dl className="cash-place__rows">
        {address ? (
          <div>
            <dt>
              <MapPin aria-hidden size={14} />
              {t('pages.register.cashPlaceAddress')}
            </dt>
            <dd>{address}</dd>
          </div>
        ) : null}
        {hours ? (
          <div>
            <dt>
              <Clock aria-hidden size={14} />
              {t('pages.register.cashPlaceHours')}
            </dt>
            <dd>{hours}</dd>
          </div>
        ) : null}
        {contact ? (
          <div>
            <dt>
              <UserRound aria-hidden size={14} />
              {t('pages.register.cashPlaceContact')}
            </dt>
            <dd>{contact}</dd>
          </div>
        ) : null}
      </dl>
      {notes ? <p className="cash-place__notes">{notes}</p> : null}
      <PlaceDirections address={address} city={event?.location} name={place} />
    </section>
  )
}
