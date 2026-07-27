import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import photoBooth from '../../assets/DSC02270.jpg'
import photoDesk from '../../assets/DSC02483.jpg'
import photoLift from '../../assets/DSC00346.jpg'
import photoMedals from '../../assets/DSC01606.jpg'
import photoSpotters from '../../assets/DSC00286.jpg'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta, isRegistrationOpen } from '../../lib/status.js'
import EventDatePlate from '../../motion/EventDatePlate.tsx'
import MaskReveal from '../../motion/MaskReveal.tsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER } from '../../motion/tokens.ts'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'
import EventCalendarActions from './EventCalendarActions.jsx'

/** Entrada del panel de copy — mismo lenguaje que HomeMembershipBand
 * (stagger 45-70ms entre estado → título → metadata → tags → CTA), para que
 * ambas cards del sistema "afiliación / Pitbull" se sientan de la misma
 * familia sin ser idénticas. */
const panelContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: MOTION_STAGGER.stepFast, delayChildren: 0.05 } },
}

const panelItem = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out } },
}

export default function PitbullSpotlight({
  variant = 'card',
  event,
  onDetail,
  onRegister,
  onJoin,
  onResults,
  registerLabel,
}) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const resolvedRegisterLabel = registerLabel ?? t('pages.events.register')
  const isHome = variant === 'home'
  const isEvents = variant === 'events'
  const dateMonthLabel = `${PITBULL_CLASSIC.dateMonth} 2026`

  if (isEvents) {
    // Todo lo visible sale de `event` (el próximo evento real, resuelto por
    // fecha/estado en EventsPage) — antes esta rama mostraba siempre los
    // datos de PITBULL_CLASSIC sin importar qué evento llegara por prop.
    const calendarEvent = event ?? {
      slug: 'pitbull-classic-2026',
      title: PITBULL_CLASSIC.title,
      venue: PITBULL_CLASSIC.venue,
      location: PITBULL_CLASSIC.location,
      startsAt: '2026-12-12T09:00:00-03:00',
      endsAt: '2026-12-13T20:00:00-03:00',
      description: t('pages.events.spotlightLead'),
    }
    const title = event?.title ?? PITBULL_CLASSIC.title
    const venue = event?.venue ?? PITBULL_CLASSIC.venue
    const location = event?.location ?? PITBULL_CLASSIC.location
    const displayDate = event?.displayDate ?? PITBULL_CLASSIC.dateShort
    const status = event?.status ?? 'proximamente'
    const { label: statusLabel, tone: statusTone } = getStatusMeta(status, t)

    // Mismo criterio que PitbullHero: el CTA principal sigue el estado real
    // del evento — antes esta ficha ofrecía "Registrarme" aunque la
    // inscripción todavía no estuviera abierta.
    const registrationOpen = isRegistrationOpen(status)
    const isFinished = status === 'finalizado'
    let primaryLabel = resolvedRegisterLabel
    let primaryAction = onRegister
    if (!registrationOpen) {
      if (isFinished) {
        primaryLabel = t('pages.home.viewResults')
        primaryAction = onResults ?? onDetail
      } else {
        primaryLabel = t('pages.pitbull.joinNow')
        primaryAction = onJoin ?? onDetail
      }
    }

    return (
      <article className="events-spotlight-card">
        <div className="events-spotlight-card__layout">
          <div className="events-spotlight-card__main">
            <p className="events-spotlight-card__eyebrow">
              <span className="events-spotlight-card__eyebrow-dot" aria-hidden />
              {t('pages.pitbull.spotlight.nextEvent')}
            </p>

            <div className="events-spotlight-card__head">
              <div className="events-spotlight-card__copy">
                <h2 className="events-spotlight-card__title">{title}</h2>
                <p className="events-spotlight-card__meta">
                  <time dateTime={event?.dateISO}>{displayDate}</time>
                  <span aria-hidden> · </span>
                  {venue}
                  <span aria-hidden> · </span>
                  {location}
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
                {primaryAction ? (
                  <Button
                    className="events-spotlight-card__cta events-spotlight-card__cta--primary motion-icon-shift"
                    onClick={primaryAction}
                  >
                    {primaryLabel}
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
      </article>
    )
  }

  if (isHome) {
    const stripPhotos = [
      { src: photoLift, key: 'lift' },
      { src: photoDesk, key: 'desk' },
      { src: photoBooth, key: 'booth' },
    ]

    const eventStatus = event?.status ?? 'proximamente'
    const { label: statusLabel } = getStatusMeta(eventStatus, t)
    const registrationOpen = isRegistrationOpen(eventStatus)
    const isFinished = eventStatus === 'finalizado'
    const isClosed = eventStatus === 'cerrado'

    /** El CTA principal nunca ofrece una acción que el usuario no puede
     * realizar: sigue el estado real del evento en vez de un texto fijo. */
    let primaryLabel = t('pages.pitbull.spotlight.viewCompetition')
    let primaryAction = onDetail
    if (registrationOpen) {
      primaryLabel = resolvedRegisterLabel
      primaryAction = onRegister ?? onDetail
    } else if (isFinished) {
      primaryLabel = t('pages.home.viewResults')
      primaryAction = onResults ?? onDetail
    } else if (isClosed) {
      primaryLabel = t('pages.pitbull.joinNow')
      primaryAction = onJoin ?? onDetail
    }
    const showSecondary = primaryAction !== onDetail

    const Panel = reducedMotion ? 'div' : m.div
    const panelProps = reducedMotion
      ? { className: 'pitbull-spotlight__home-panel' }
      : {
          className: 'pitbull-spotlight__home-panel',
          variants: panelContainer,
          initial: 'hidden',
          whileInView: 'visible',
          viewport: { once: true, amount: 0.4 },
        }
    const PanelItem = reducedMotion ? 'div' : m.div
    const panelItemProps = reducedMotion ? {} : { variants: panelItem }

    return (
      <article className="pitbull-spotlight pitbull-spotlight--home">
        <div className="pitbull-spotlight__home-tilt">
          <div className="pitbull-spotlight__home-stage">
            <div className="pitbull-spotlight__home-media">
              <MaskReveal className="pitbull-spotlight__home-hero" direction="left">
                <button
                  type="button"
                  className="pitbull-spotlight__home-hero-frame pitbull-spotlight__home-hero-frame--link"
                  aria-label={primaryLabel}
                  onClick={() => primaryAction?.()}
                >
                  <picture>
                    {/* Tablet/notebook (640-1199): foto landscape, encaja mejor en
                        la caja apaisada de esos anchos. Mobile chico y desktop
                        amplio usan el retrato de medallas. */}
                    <source
                      media="(min-width: 640px) and (max-width: 1199px)"
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
                </button>
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

            <Panel {...panelProps}>
              <span className="pitbull-spotlight__home-glow" aria-hidden />

              <PanelItem {...panelItemProps}>
                <header className="pitbull-spotlight__home-head">
                  <p className="pitbull-spotlight__home-kicker">
                    <span className="pitbull-spotlight__home-kicker-dot" aria-hidden />
                    <span>{t('pages.pitbull.heroEyebrow')}</span>
                    <span className="pitbull-spotlight__home-kicker-sep" aria-hidden>
                      ·
                    </span>
                    <span>{statusLabel}</span>
                  </p>
                  <h2 className="pitbull-spotlight__home-title">{PITBULL_CLASSIC.title}</h2>
                  <p className="pitbull-spotlight__home-lead">{t('pages.pitbull.heroLead')}</p>
                </header>
              </PanelItem>

              <PanelItem {...panelItemProps}>
                <dl className="pitbull-spotlight__home-facts">
                  <div className="pitbull-spotlight__home-fact pitbull-spotlight__home-fact--date">
                    <dt>{t('pages.pitbull.quickFactsDate')}</dt>
                    <dd>
                      <time dateTime="2026-12-12/2026-12-13">{PITBULL_CLASSIC.date}</time>
                    </dd>
                  </div>
                  <div className="pitbull-spotlight__home-fact pitbull-spotlight__home-fact--venue">
                    <dt>{t('pages.pitbull.quickFactsVenue')}</dt>
                    <dd>
                      <span className="pitbull-spotlight__home-fact-primary">{PITBULL_CLASSIC.venue}</span>
                      <span className="pitbull-spotlight__home-fact-sep" aria-hidden>
                        ·
                      </span>
                      <span className="pitbull-spotlight__home-fact-secondary">{PITBULL_CLASSIC.location}</span>
                    </dd>
                  </div>
                </dl>
              </PanelItem>

              <PanelItem {...panelItemProps}>
                <ul className="pitbull-spotlight__home-tags" aria-label={t('pages.pitbull.categories')}>
                  {PITBULL_CLASSIC.categories.map((category) => (
                    <li key={category}>{category}</li>
                  ))}
                </ul>
              </PanelItem>

              <PanelItem {...panelItemProps}>
                <footer className="pitbull-spotlight__home-actions">
                  <Button
                    variant="gold"
                    className="pitbull-spotlight__home-cta motion-icon-shift"
                    onClick={() => primaryAction?.()}
                  >
                    {primaryLabel}
                    <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
                  </Button>
                  {showSecondary ? (
                    <button
                      type="button"
                      className="pitbull-spotlight__home-cta-secondary"
                      onClick={() => onDetail?.()}
                    >
                      {t('pages.pitbull.spotlight.viewFullCard')}
                    </button>
                  ) : null}
                </footer>
              </PanelItem>
            </Panel>
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
