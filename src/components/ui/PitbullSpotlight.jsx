import { ArrowRight, Calendar, MapPin } from 'lucide-react'
import pitbullVisual from '../../assets/powerlifting-hero.png'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import EventDatePlate from '../../motion/EventDatePlate.tsx'
import MaskReveal from '../../motion/MaskReveal.tsx'
import StaggerGroup from '../../motion/StaggerGroup.tsx'
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
  const dateMonthLabel = `${PITBULL_CLASSIC.dateMonth} 2026`

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
    const { label: statusLabel, tone: statusTone } = getStatusMeta(status, t)

    return (
      <article className="events-spotlight-card">
        <div className="events-spotlight-card__layout">
          <div className="events-spotlight-card__main">
            <div className="events-spotlight-card__head">
              <div className="events-spotlight-card__copy">
                <h2 className="events-spotlight-card__title">{PITBULL_CLASSIC.title}</h2>
                <p className="events-spotlight-card__meta">
                  {PITBULL_CLASSIC.venue}
                  <span aria-hidden> · </span>
                  {PITBULL_CLASSIC.location}
                </p>
              </div>
              <span className={`events-spotlight-card__status events-spotlight-card__status--${statusTone}`}>
                {statusLabel}
              </span>
            </div>

            <div className="events-spotlight-card__foot">
              <div className="events-spotlight-card__actions">
                <Button variant="outline" className="btn--small motion-icon-shift" onClick={onDetail}>
                  {t('pages.pitbull.spotlight.viewDetail')}
                  <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
                </Button>
                {onRegister ? (
                  <Button className="btn--small" onClick={onRegister}>
                    {resolvedRegisterLabel}
                  </Button>
                ) : null}
              </div>
              <EventCalendarActions event={calendarEvent} className="events-spotlight-card__calendar" compact />
            </div>
          </div>
        </div>
        <time className="events-spotlight-card__date-sr" dateTime="2026-12-12/2026-12-13">
          {PITBULL_CLASSIC.date}
        </time>
      </article>
    )
  }

  if (isHome) {
    const highlights = [
      {
        id: 'date',
        icon: Calendar,
        label: t('pages.pitbull.quickFactsDate'),
        value: <time dateTime="2026-12-12">{PITBULL_CLASSIC.date}</time>,
      },
      {
        id: 'venue',
        icon: MapPin,
        label: t('pages.pitbull.quickFactsVenue'),
        value: PITBULL_CLASSIC.venue,
      },
    ]

    return (
      <article className="pitbull-spotlight pitbull-spotlight--home">
        <div className="pitbull-spotlight__home-stripe" aria-hidden />

        <div className="pitbull-spotlight__home-layout">
          <figure className="pitbull-spotlight__home-media-shell">
            <MaskReveal className="pitbull-spotlight__home-media" direction="left">
              <img
                src={pitbullVisual}
                alt=""
                className="pitbull-spotlight__home-media-img"
                loading="lazy"
                decoding="async"
              />
            </MaskReveal>
            <EventDatePlate
              day={PITBULL_CLASSIC.dateDay}
              month={dateMonthLabel}
              className="pitbull-spotlight__home-date"
              tilt={false}
            />
          </figure>

          <div className="pitbull-spotlight__home-panel">
            <header className="pitbull-spotlight__home-head">
              <div className="pitbull-spotlight__home-head-top">
                <span className="pitbull-spotlight__home-chapter">{t('pages.pitbull.heroEyebrow')}</span>
                <span className="pitbull-spotlight__home-status-pill">
                  {t('pages.pitbull.spotlight.registrationSoon')}
                </span>
              </div>
              <h2 className="pitbull-spotlight__home-title">{PITBULL_CLASSIC.title}</h2>
              <p className="pitbull-spotlight__home-lead">{t('pages.pitbull.heroLead')}</p>
              <ul className="pitbull-spotlight__home-tags" aria-label={t('pages.pitbull.categories')}>
                {PITBULL_CLASSIC.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            </header>

            <StaggerGroup
              as="ul"
              className="pitbull-spotlight__home-highlights"
              stagger={55}
              delayChildren={120}
              variant="up"
            >
              {highlights.map(({ icon: Icon, id, label, value }) => (
                <li key={id} className={`pitbull-spotlight__home-highlight pitbull-spotlight__home-highlight--${id}`}>
                  <span className="pitbull-spotlight__home-highlight-icon" aria-hidden>
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <div className="pitbull-spotlight__home-highlight-copy">
                    <span className="pitbull-spotlight__home-highlight-label">{label}</span>
                    <span className="pitbull-spotlight__home-highlight-value">{value}</span>
                  </div>
                </li>
              ))}
            </StaggerGroup>

            <footer className="pitbull-spotlight__home-actions">
              <button
                type="button"
                className="pitbull-spotlight__home-cta pitbull-spotlight__home-cta--primary motion-icon-shift"
                onClick={onDetail}
              >
                {t('pages.pitbull.spotlight.viewDetail')}
                <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
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

      <MaskReveal className="pitbull-spotlight__visual" direction="right">
        <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" aria-hidden />
        <div className="pitbull-spotlight__visual-overlay" aria-hidden />
        <span className="pitbull-spotlight__badge">{t('pages.pitbull.spotlight.featured')}</span>
        <EventDatePlate
          day={PITBULL_CLASSIC.dateDay}
          month={dateMonthLabel}
          className="pitbull-spotlight__visual-date"
          as="div"
        />
      </MaskReveal>
    </article>
  )
}
