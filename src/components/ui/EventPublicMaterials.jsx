import { useEffect, useState } from 'react'
import { ClipboardList, Clock3, UsersRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRelativeTime } from '../../lib/format.js'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { eventExternalForm } from '../../lib/eventExternalForm.js'
import {
  eventShowsPublicRecentRegistrants,
  eventShowsPublicSchedule,
} from '../../lib/eventPublicSurface.js'
import { useEventRegistrationCapacity } from '../../hooks/useEventRegistrationCapacity.js'
import { usePublicEventSchedule } from '../../hooks/usePublicEventSchedule.js'
import PublicEventSchedule from './PublicEventSchedule.jsx'
import '../../styles/components/event-public-materials.css'

const MAX_RECENT_REGISTRANTS = 6

/** Botón y QR del Google Form del evento. El QR se arma en el navegador. */
function ExternalFormBlock({ form }) {
  const { t } = useI18n()
  const [qrSrc, setQrSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    setQrSrc('')
    generateCredentialQr(form.url)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        // Sin QR el botón sigue funcionando.
      })
    return () => {
      cancelled = true
    }
  }, [form.url])

  return (
    <section className="event-public-materials__section" aria-labelledby="event-public-form-title">
      <header className="event-public-materials__head">
        <span className="event-public-materials__icon" aria-hidden>
          <ClipboardList size={17} />
        </span>
        <div>
          <h3 id="event-public-form-title">{t('pages.events.externalFormTitle')}</h3>
          <p>{t('pages.events.externalFormLead')}</p>
        </div>
      </header>
      <div className="event-public-materials__form">
        <a
          className="event-public-materials__form-link"
          href={form.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {form.label || t('pages.events.externalFormDefaultLabel')}
        </a>
        {qrSrc ? (
          <img
            alt={t('pages.events.externalFormQrAlt')}
            className="event-public-materials__form-qr"
            height="132"
            src={qrSrc}
            width="132"
          />
        ) : null}
      </div>
    </section>
  )
}

/**
 * Material operativo que puede aparecer en la ficha pública de cualquier
 * evento. Cada bloque se carga solo cuando el administrador lo habilitó.
 */
export default function EventPublicMaterials({
  className = '',
  event,
  includeSchedule = true,
  hideEmptyRecent = false,
}) {
  const { locale, t } = useI18n()
  const eventSlug = event?.slug ?? ''
  const showSchedule = includeSchedule && eventShowsPublicSchedule(event)
  const showRecentRegistrants = eventShowsPublicRecentRegistrants(event)
  const { schedule, updatedAt } = usePublicEventSchedule(eventSlug, { enabled: showSchedule })
  const { recent, status } = useEventRegistrationCapacity(eventSlug, {
    enabled: showRecentRegistrants,
  })

  const visibleRecent = recent.slice(0, MAX_RECENT_REGISTRANTS)
  const renderSchedule = showSchedule && schedule.hasContent
  const renderRecent =
    showRecentRegistrants && (!hideEmptyRecent || visibleRecent.length > 0)
  const externalForm = eventExternalForm(event)
  const renderForm = Boolean(externalForm.url)

  if (!renderSchedule && !renderRecent && !renderForm) return null

  return (
    <div className={`event-public-materials ${className}`.trim()}>
      {renderForm ? <ExternalFormBlock form={externalForm} /> : null}

      {renderSchedule ? (
        <section className="event-public-materials__section" aria-labelledby="event-public-schedule-title">
          <header className="event-public-materials__head">
            <span className="event-public-materials__icon" aria-hidden>
              <Clock3 size={17} />
            </span>
            <div>
              <h3 id="event-public-schedule-title">{t('pages.events.publicScheduleTitle')}</h3>
              <p>{t('pages.events.publicScheduleLead')}</p>
            </div>
          </header>
          <PublicEventSchedule schedule={schedule} updatedAt={updatedAt} />
        </section>
      ) : null}

      {renderRecent ? (
        <section className="event-public-materials__section" aria-labelledby="event-public-recent-title">
          <header className="event-public-materials__head">
            <span className="event-public-materials__icon" aria-hidden>
              <UsersRound size={17} />
            </span>
            <div>
              <div className="event-public-materials__title-row">
                <h3 id="event-public-recent-title">{t('pages.events.recentRegistrantsTitle')}</h3>
                {status === 'live' ? (
                  <span className="event-public-materials__live">
                    <span aria-hidden />
                    {t('pages.events.recentRegistrantsLive')}
                  </span>
                ) : null}
              </div>
              <p>{t('pages.events.recentRegistrantsLead')}</p>
            </div>
          </header>
          {visibleRecent.length > 0 ? (
            <ol className="event-public-materials__recent-list">
              {visibleRecent.map((item, index) => (
                <li key={`${item.displayName}-${item.registeredAt ?? index}`}>
                  <div>
                    <strong>{item.displayName}</strong>
                    {item.gym ? <span>{item.gym}</span> : null}
                  </div>
                  {item.registeredAt ? (
                    <time dateTime={item.registeredAt}>
                      {formatRelativeTime(item.registeredAt, locale)}
                    </time>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="event-public-materials__empty" role="status">
              {t('pages.events.recentRegistrantsEmpty')}
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}
