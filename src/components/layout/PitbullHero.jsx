import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import photoPlatformCrew from '../../assets/DSC00286-display.jpg'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

function PitbullHeroPanel({
  canRegister,
  eventStatus,
  onHome,
  onRegister,
  onSecondary,
  date,
  venue,
  location,
  registered,
  registrationFee,
  slots,
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
          <p className="pitbull-hero-masthead__lead">{t('pages.pitbull.heroLead')}</p>
        </Item>
      </header>

      <Item {...itemProps}>
        <div className="pitbull-hero-masthead__meta" aria-label={t('pages.pitbull.heroMetricsAria')}>
          <div className="pitbull-hero-masthead__meta-copy">
            <time className="pitbull-hero-masthead__dateline" dateTime="2026-12-12/2026-12-13">
              {date}
            </time>
            <p className="pitbull-hero-masthead__venue">
              <span className="pitbull-hero-masthead__venue-name">{venue}</span>
            </p>
            {location ? <p className="pitbull-hero-masthead__loc">{location}</p> : null}
          </div>
          <p className="pitbull-hero-masthead__slots">
            <span className="pitbull-hero-masthead__slots-label">{t('pages.pitbull.heroSlots')}</span>
            <span className="pitbull-hero-masthead__slots-value">
              {registered}
              <span className="pitbull-hero-masthead__slots-sep" aria-hidden>
                /
              </span>
              {slots}
            </span>
          </p>
        </div>
      </Item>

      <Item {...itemProps}>
        <div className="pitbull-hero-masthead__actions" aria-label={t('pages.pitbull.heroSecondaryAria')}>
          <div className="pitbull-hero-masthead__cta-group">
            <button
              type="button"
              className="pitbull-hero-masthead__cta pitbull-hero-masthead__cta--primary motion-icon-shift"
              onClick={onRegister}
            >
              {primaryLabel}
              <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
            </button>
            <span className="pitbull-hero-masthead__fee">
              <span className="pitbull-hero-masthead__fee-label">{t('pages.pitbull.heroFee')}</span>
              <span className="pitbull-hero-masthead__fee-value">{registrationFee}</span>
            </span>
          </div>
          <button type="button" className="pitbull-hero-masthead__text-link" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        </div>
      </Item>
    </div>
  )
}

/** Foto a sangre: sin ficha encima. En desktop corta al borde derecho;
 * en mobile el texto se superpone a la foto (scrim). */
function PitbullHeroFrame() {
  return (
    <div className="pitbull-hero-masthead__frame" aria-hidden>
      <div className="pitbull-hero-masthead__frame-plate">
        <img
          className="pitbull-hero-masthead__frame-img"
          src={photoPlatformCrew}
          alt=""
          width={800}
          height={1200}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <div className="pitbull-hero-masthead__frame-scrim" />
      </div>
    </div>
  )
}

export default function PitbullHero({
  canRegister,
  eventStatus,
  onHome,
  onRegister,
  onSecondary,
  date,
  venue,
  location,
  registered,
  registrationFee,
  slots,
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
      date={date}
      venue={venue}
      location={location}
      registered={registered}
      registrationFee={registrationFee}
      slots={slots}
      ticketsOpen={ticketsOpen}
      t={t}
      title={title}
      motion={!reducedMotion}
    />
  )

  const frame = <PitbullHeroFrame />

  const className =
    'pitbull-hero-masthead pitbull-hero-masthead--text pitbull-hero-masthead--bleed' +
    (reducedMotion ? '' : ' pitbull-hero-masthead--motion')

  if (reducedMotion) {
    return (
      <header className={className}>
        <div className="pitbull-hero-masthead__shell">
          <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--bleed">
            {panel}
            {frame}
          </div>
        </div>
      </header>
    )
  }

  return (
    <m.header
      className={className}
      initial="hidden"
      animate="visible"
      variants={heroStaggerContainer}
    >
      <div className="pitbull-hero-masthead__shell">
        <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--bleed">
          {panel}
          {frame}
        </div>
      </div>
    </m.header>
  )
}
