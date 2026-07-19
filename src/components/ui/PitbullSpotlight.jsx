import { ArrowRight } from 'lucide-react'
import photoBooth from '../../assets/DSC02270.jpg'
import photoDesk from '../../assets/DSC02483.jpg'
import photoLift from '../../assets/DSC00346.jpg'
import photoMedals from '../../assets/DSC01606.jpg'
import photoSpotters from '../../assets/DSC00286.jpg'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import EventDatePlate from '../../motion/EventDatePlate.tsx'
import MaskReveal from '../../motion/MaskReveal.tsx'
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
              <div
                className="events-spotlight-card__actions"
                role="group"
                aria-label={t('pages.events.spotlightActionsAria')}
              >
                {onRegister ? (
                  <Button
                    className="events-spotlight-card__cta events-spotlight-card__cta--primary motion-icon-shift"
                    onClick={onRegister}
                  >
                    {resolvedRegisterLabel}
                    <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="events-spotlight-card__cta events-spotlight-card__cta--secondary"
                  onClick={onDetail}
                >
                  {t('pages.pitbull.spotlight.viewDetail')}
                </Button>
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
    const stripPhotos = [
      { src: photoLift, key: 'lift' },
      { src: photoDesk, key: 'desk' },
      { src: photoBooth, key: 'booth' },
    ]

    return (
      <article className="pitbull-spotlight pitbull-spotlight--home">
        <p className="pitbull-spotlight__home-mark" aria-hidden>
          PITBULL
        </p>

        <div className="pitbull-spotlight__home-stage">
          <div className="pitbull-spotlight__home-media">
            <MaskReveal className="pitbull-spotlight__home-hero" direction="left">
              <figure className="pitbull-spotlight__home-hero-frame">
                <picture>
                  {/* Notebook: foto landscape; desktop amplio usa el retrato de medallas. */}
                  <source
                    media="(min-width: 960px) and (max-width: 1199px)"
                    srcSet={photoLift}
                  />
                  <img
                    src={photoMedals}
                    alt=""
                    className="pitbull-spotlight__home-hero-img"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
                <div className="pitbull-spotlight__home-hero-scrim" aria-hidden />
                <span className="pitbull-spotlight__home-hero-badge">
                  {t('pages.pitbull.spotlight.featured')}
                </span>
                <EventDatePlate
                  day={PITBULL_CLASSIC.dateDay}
                  month={dateMonthLabel}
                  className="pitbull-spotlight__home-date"
                  as="div"
                  tilt={false}
                />
              </figure>
            </MaskReveal>

            <div className="pitbull-spotlight__home-strip" aria-hidden>
              {stripPhotos.map((photo) => (
                <figure
                  key={photo.key}
                  className={`pitbull-spotlight__home-strip-tile pitbull-spotlight__home-strip-tile--${photo.key}`}
                >
                  <img
                    src={photo.src}
                    alt=""
                    className="pitbull-spotlight__home-strip-img"
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              ))}
            </div>
          </div>

          <div className="pitbull-spotlight__home-panel">
            <header className="pitbull-spotlight__home-head">
              <p className="pitbull-spotlight__home-kicker">
                <span className="pitbull-spotlight__home-kicker-dot" aria-hidden />
                <span>{t('pages.pitbull.heroEyebrow')}</span>
                <span className="pitbull-spotlight__home-kicker-sep" aria-hidden>
                  ·
                </span>
                <span>{t('pages.pitbull.spotlight.registrationSoon')}</span>
              </p>
              <h2 className="pitbull-spotlight__home-title">{PITBULL_CLASSIC.title}</h2>
              <p className="pitbull-spotlight__home-lead">{t('pages.pitbull.heroLead')}</p>
            </header>

            <dl className="pitbull-spotlight__home-facts">
              <div className="pitbull-spotlight__home-fact">
                <dt>{t('pages.pitbull.quickFactsDate')}</dt>
                <dd>
                  <time dateTime="2026-12-12/2026-12-13">{PITBULL_CLASSIC.date}</time>
                </dd>
              </div>
              <div className="pitbull-spotlight__home-fact">
                <dt>{t('pages.pitbull.quickFactsVenue')}</dt>
                <dd>
                  {PITBULL_CLASSIC.venue}
                  <span aria-hidden> · </span>
                  {PITBULL_CLASSIC.location}
                </dd>
              </div>
            </dl>

            <ul className="pitbull-spotlight__home-tags" aria-label={t('pages.pitbull.categories')}>
              {PITBULL_CLASSIC.categories.map((category) => (
                <li key={category}>{category}</li>
              ))}
            </ul>

            <footer className="pitbull-spotlight__home-actions">
              <button
                type="button"
                className="pitbull-spotlight__home-cta motion-icon-shift"
                onClick={onDetail}
              >
                {t('pages.pitbull.spotlight.viewDetail')}
                <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
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
        <img src={photoSpotters} alt="" className="pitbull-spotlight__visual-img" aria-hidden />
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
