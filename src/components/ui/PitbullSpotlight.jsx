import { ArrowRight } from 'lucide-react'
import pitbullVisual from '../../assets/powerlifting-hero.png'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'
import EventCalendarActions from './EventCalendarActions.jsx'

export default function PitbullSpotlight({
  variant = 'card',
  event,
  onDetail,
  onRegister,
  registerLabel,
}) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const resolvedRegisterLabel = registerLabel ?? t('pages.events.register')
  const isHome = variant === 'home'
  const isEvents = variant === 'events'

  if (isEvents) {
    const calendarEvent = event ?? {
      slug: 'pitbull-classic-2026',
      title: PITBULL_CLASSIC.title,
      venue: PITBULL_CLASSIC.venue,
      location: PITBULL_CLASSIC.location,
      startsAt: '2026-12-12T09:00:00-03:00',
      endsAt: '2026-12-13T20:00:00-03:00',
      description: t('pages.events.spotlightLead'),
    }
    const status = event?.status ?? 'proximamente'
    const { label: statusLabel } = getStatusMeta(status, t)

    return (
      <article className="pitbull-spotlight pitbull-spotlight--events">
        <div className="pitbull-spotlight__events-layout">
          <figure className="pitbull-spotlight__events-media">
            <img
              src={pitbullVisual}
              alt=""
              className="pitbull-spotlight__events-media-img"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="pitbull-spotlight__events-date-badge" aria-hidden>
              <span className="pitbull-spotlight__events-date-day">{PITBULL_CLASSIC.dateDay}</span>
              <span className="pitbull-spotlight__events-date-month">
                {PITBULL_CLASSIC.dateMonth} 2026
              </span>
            </figcaption>
          </figure>

          <div className="pitbull-spotlight__events-panel">
            <header className="pitbull-spotlight__events-head">
              <div className="pitbull-spotlight__events-head-row">
                <span className="pitbull-spotlight__events-kicker">{t('pages.events.nextMeet')}</span>
                <span className="pitbull-spotlight__events-status-badge">{statusLabel}</span>
              </div>
              <h2 className="pitbull-spotlight__events-title">{PITBULL_CLASSIC.title}</h2>
              <p className="pitbull-spotlight__events-lead">{t('pages.events.spotlightLead')}</p>
            </header>

            <dl className="pitbull-spotlight__events-facts">
              <div className="pitbull-spotlight__events-fact">
                <dt>{t('pages.pitbull.quickFactsDate')}</dt>
                <dd>
                  <time dateTime="2026-12-12">{PITBULL_CLASSIC.date}</time>
                </dd>
              </div>
              <div className="pitbull-spotlight__events-fact">
                <dt>{t('pages.pitbull.quickFactsVenue')}</dt>
                <dd>
                  {PITBULL_CLASSIC.venue}
                  <span aria-hidden> · </span>
                  {PITBULL_CLASSIC.location}
                </dd>
              </div>
            </dl>

            <EventCalendarActions event={calendarEvent} className="pitbull-spotlight__events-calendar" />

            <footer className="pitbull-spotlight__events-foot">
              <div className="pitbull-spotlight__events-actions">
                <Button variant="outline" className="btn--small" onClick={onDetail}>
                  {t('pages.pitbull.spotlight.viewDetail')}
                  <ArrowRight size={14} aria-hidden />
                </Button>
                {onRegister ? (
                  <Button className="btn--small" onClick={onRegister}>
                    {resolvedRegisterLabel}
                  </Button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      </article>
    )
  }

  if (isHome) {
    return (
      <article className="pitbull-spotlight pitbull-spotlight--home">
        <div className="pitbull-spotlight__home-stripe" aria-hidden />

        <div className="pitbull-spotlight__home-layout">
          <figure className="pitbull-spotlight__home-media">
            <img
              src={pitbullVisual}
              alt=""
              className="pitbull-spotlight__home-media-img"
              loading="lazy"
              decoding="async"
            />
          </figure>

          <div className="pitbull-spotlight__home-panel">
            <header className="pitbull-spotlight__home-head">
              <span className="pitbull-spotlight__home-eyebrow">{t('pages.pitbull.heroEyebrow')}</span>
              <h2 className="pitbull-spotlight__home-title">{PITBULL_CLASSIC.title}</h2>
              <p className="pitbull-spotlight__home-lead">{t('pages.pitbull.heroLead')}</p>
            </header>

            <dl className="pitbull-spotlight__home-facts">
              <div className="pitbull-spotlight__home-fact">
                <dt>{t('pages.pitbull.quickFactsDate')}</dt>
                <dd>
                  <time dateTime="2026-12-12">{PITBULL_CLASSIC.date}</time>
                </dd>
              </div>
              <div className="pitbull-spotlight__home-fact">
                <dt>{t('pages.pitbull.quickFactsVenue')}</dt>
                <dd>{PITBULL_CLASSIC.venue}</dd>
              </div>
            </dl>

            <footer className="pitbull-spotlight__home-foot">
              <span className="pitbull-spotlight__home-status">{t('pages.pitbull.spotlight.registrationSoon')}</span>
              <button type="button" className="pitbull-spotlight__home-cta" onClick={onDetail}>
                {t('pages.pitbull.spotlight.viewDetail')}
                <ArrowRight size={14} aria-hidden />
              </button>
            </footer>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="pitbull-spotlight pitbull-spotlight--design">
      <div className="pitbull-spotlight__copy">
        <span className="pitbull-spotlight__eyebrow">
          <span className="pitbull-spotlight__eyebrow-dot" aria-hidden />
          {t('pages.pitbull.spotlight.nextEvent')}
        </span>
        <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
        <p className="pitbull-spotlight__desc">{PITBULL_CLASSIC.tagline}</p>

        <ul className="pitbull-spotlight__meta">
          <li>{PITBULL_CLASSIC.date}</li>
          <li>{PITBULL_CLASSIC.location}</li>
        </ul>

        <div className="pitbull-spotlight__tags">
          {PITBULL_CLASSIC.categories.map((category) => (
            <span key={category} className="pitbull-spotlight__tag">
              {category}
            </span>
          ))}
        </div>

        <div className="pitbull-spotlight__capacity">
          <CapacityBar
            current={PITBULL_CLASSIC.registered}
            total={PITBULL_CLASSIC.slots}
            label={t('pages.pitbull.spotlight.slotsOccupied')}
          />
        </div>

        <div className="pitbull-spotlight__actions">
          <Button onClick={onDetail}>{t('pages.events.viewPitbull')}</Button>
          {onRegister ? (
            <Button variant="outline" onClick={onRegister}>
              {resolvedRegisterLabel}
            </Button>
          ) : (
            <span className="pitbull-spotlight__soon">
              <span className="pitbull-spotlight__soon-dot" aria-hidden />
              {t('pages.pitbull.spotlight.registrationSoon')}
            </span>
          )}
        </div>
      </div>

      <div className="pitbull-spotlight__visual" aria-hidden>
        <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" />
        <div className="pitbull-spotlight__visual-overlay" />
        <span className="pitbull-spotlight__badge">{t('pages.pitbull.spotlight.featured')}</span>
        <div className="pitbull-spotlight__visual-date">
          <span className="pitbull-spotlight__visual-date-day">{PITBULL_CLASSIC.dateDay}</span>
          <span className="pitbull-spotlight__visual-date-month">{PITBULL_CLASSIC.dateMonth} 2026</span>
        </div>
      </div>
    </article>
  )
}
