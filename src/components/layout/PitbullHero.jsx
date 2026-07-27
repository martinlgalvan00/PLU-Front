import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import photoMedals from '../../assets/DSC01606.jpg'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import TiltCard from '../../motion/TiltCard.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

function PitbullHeroShowcase({ eventStatus, pitbullClassic, t, title }) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)
  return (
    <TiltCard
      className="pitbull-hero-masthead__showcase pitbull-hero-card-tilt"
      innerClassName="tilt-card__inner pitbull-hero-card"
      maxTilt={3}
    >
      <div className="pitbull-hero-card__stack">
        <span className="pitbull-hero-card__glow" aria-hidden />
        <span className="pitbull-hero-card__watermark" aria-hidden>
          PLU
        </span>
        <span className="pitbull-hero-card__stripe" aria-hidden />
        <div className="pitbull-hero-card__body">
          <header className="pitbull-hero-card__head">
            <span className={`pitbull-hero-card__badge pitbull-hero-card__badge--${statusTone}`}>
              <span className="pitbull-hero-card__badge-dot" aria-hidden />
              {statusLabel}
            </span>
            <span className="pitbull-hero-card__season">2026</span>
          </header>
          <p className="pitbull-hero-card__title">{title}</p>
          <dl className="pitbull-hero-card__rows">
            <div className="pitbull-hero-card__row">
              <dt>{t('pages.pitbull.heroDate')}</dt>
              <dd>{pitbullClassic.date}</dd>
            </div>
            <div className="pitbull-hero-card__row">
              <dt>{t('pages.pitbull.heroVenue')}</dt>
              <dd>{pitbullClassic.venue}</dd>
            </div>
            <div className="pitbull-hero-card__row">
              <dt>{t('pages.pitbull.heroSlots')}</dt>
              <dd>
                {pitbullClassic.registered} / {pitbullClassic.slots}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </TiltCard>
  )
}

function PitbullHeroPanel({
  canRegister,
  eventStatus,
  onHome,
  onRegister,
  onSecondary,
  pitbullClassic,
  ticketsOpen,
  t,
  title,
  motion = false,
}) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)
  const isFinished = eventStatus === 'finalizado'
  const primaryLabel = canRegister
    ? t('pages.pitbull.register')
    : isFinished
      ? t('pages.home.viewResults')
      : t('pages.pitbull.joinNow')
  const secondaryLabel = ticketsOpen ? t('pages.pitbull.heroTickets') : t('pages.pitbull.ctaCategories')
  const Item = motion ? m.div : 'div'
  const itemProps = motion ? { variants: heroSequenceItem } : {}

  return (
    <div className="pitbull-hero-masthead__panel">
      <Item {...itemProps}>
        <nav className="pitbull-hero-masthead__breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={onHome}>
            {t('design.home')}
          </button>
          <span aria-hidden>/</span>
          <span>{t('pages.pitbull.heroBreadcrumb')}</span>
        </nav>
      </Item>

      <header className="pitbull-hero-masthead__head">
        <Item {...itemProps}>
          <span
            className={`pitbull-hero-masthead__status-badge pitbull-hero-masthead__status-badge--${statusTone}`}
          >
            <span className="pitbull-hero-masthead__status-badge-dot" aria-hidden />
            {statusLabel}
          </span>
        </Item>

        <Item {...itemProps}>
          <h1 className="pitbull-hero-masthead__title">{title}</h1>
        </Item>

        <Item {...itemProps}>
          <div className="pitbull-hero-masthead__dateline">
            <time className="pitbull-hero-masthead__date" dateTime="2026-12-12/2026-12-13">
              {pitbullClassic.date}
            </time>
            <p className="pitbull-hero-masthead__venue-text">
              {pitbullClassic.venue}
              <span aria-hidden> · </span>
              {pitbullClassic.location}
            </p>
          </div>
        </Item>

        <Item {...itemProps}>
          <p className="pitbull-hero-masthead__lead">{t('pages.pitbull.heroLead')}</p>
        </Item>
      </header>

      <Item {...itemProps}>
        <div className="pitbull-hero-masthead__actions" aria-label={t('pages.pitbull.heroSecondaryAria')}>
          <button
            type="button"
            className="pitbull-hero-masthead__cta pitbull-hero-masthead__cta--primary motion-icon-shift"
            onClick={onRegister}
          >
            {primaryLabel}
            <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
          </button>
          <button
            type="button"
            className="pitbull-hero-masthead__text-link"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </button>
        </div>
      </Item>
    </div>
  )
}

/** Marco de imagen contenido — la ficha protagonista se apoya sobre su
 * borde inferior, en vez de flotar sobre una foto a sangre completa. */
function PitbullHeroFrame({ eventStatus, pitbullClassic, t, title }) {
  return (
    <div className="pitbull-hero-masthead__frame">
      <div className="pitbull-hero-masthead__frame-plate">
        <img
          className="pitbull-hero-masthead__frame-img"
          src={photoMedals}
          alt=""
          width={800}
          height={1200}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <div className="pitbull-hero-masthead__frame-scrim" aria-hidden />
      </div>
      <PitbullHeroShowcase
        eventStatus={eventStatus}
        pitbullClassic={pitbullClassic}
        t={t}
        title={title}
      />
    </div>
  )
}

export default function PitbullHero({
  canRegister,
  eventStatus,
  onHome,
  onRegister,
  onSecondary,
  pitbullClassic,
  ticketsOpen,
  title,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const panel = (
    <PitbullHeroPanel
      canRegister={canRegister}
      eventStatus={eventStatus}
      onHome={onHome}
      onRegister={onRegister}
      onSecondary={onSecondary}
      pitbullClassic={pitbullClassic}
      ticketsOpen={ticketsOpen}
      t={t}
      title={title}
      motion={!reducedMotion}
    />
  )

  const frame = (
    <PitbullHeroFrame
      eventStatus={eventStatus}
      pitbullClassic={pitbullClassic}
      t={t}
      title={title}
    />
  )

  if (reducedMotion) {
    return (
      <header className="pitbull-hero-masthead pitbull-hero-masthead--text pitbull-hero-masthead--split">
        <div className="pitbull-hero-masthead__shell">
          <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--split">
            {panel}
            {frame}
          </div>
        </div>
      </header>
    )
  }

  return (
    <m.header
      className="pitbull-hero-masthead pitbull-hero-masthead--text pitbull-hero-masthead--split pitbull-hero-masthead--motion"
      initial="hidden"
      animate="visible"
      variants={heroStaggerContainer}
    >
      <div className="pitbull-hero-masthead__shell">
        <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--split">
          {panel}
          {frame}
        </div>
      </div>
    </m.header>
  )
}
