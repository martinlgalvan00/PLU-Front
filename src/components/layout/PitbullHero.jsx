import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import photoPlatformCrew from '../../assets/DSC00286-display.jpg'
import photoMeetFloor from '../../assets/DSC00346-display.jpg'
import photoMedals from '../../assets/DSC01606-display.jpg'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'
import PitbullBrandMark from '../ui/PitbullBrandMark.jsx'

const HERO_COLLAGE = [
  {
    id: 'crew',
    src: photoPlatformCrew,
    className: 'pitbull-hero-masthead__plate--primary',
    width: 800,
    height: 1200,
    eager: true,
  },
  {
    id: 'platform',
    src: photoMeetFloor,
    className: 'pitbull-hero-masthead__plate--secondary',
    width: 800,
    height: 1200,
    eager: false,
  },
  {
    id: 'medals',
    src: photoMedals,
    className: 'pitbull-hero-masthead__plate--accent',
    width: 800,
    height: 1200,
    eager: false,
  },
]

function PitbullHeroPanel({
  canRegister,
  eventStatus,
  onHome,
  onRegister,
  onSecondary,
  registrationFee,
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
      : eventStatus === 'proximamente'
        ? t('launchTeaser.notifyCta')
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
          <PitbullBrandMark
            size="lg"
            className="pitbull-hero-masthead__event-logo"
            label={t('nav.pitbull')}
            priority
          />
        </Item>

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

/** Collage editorial a sangre: 1 dominante + 2 secundarias (desktop). Mobile: solo LCP. */
function PitbullHeroFrame({ reducedMotion = false }) {
  const Plate = reducedMotion ? 'div' : m.div

  return (
    <div className="pitbull-hero-masthead__frame" aria-hidden>
      <div className="pitbull-hero-masthead__collage">
        {HERO_COLLAGE.map((plate, index) => (
          <Plate
            key={plate.id}
            className={`pitbull-hero-masthead__frame-plate ${plate.className}`}
            {...(reducedMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 14 },
                  animate: { opacity: 1, y: 0 },
                  transition: {
                    duration: MOTION_DURATION.slow,
                    ease: MOTION_EASE.out,
                    delay: 0.12 + index * 0.08,
                  },
                })}
          >
            <img
              className="pitbull-hero-masthead__frame-img"
              src={plate.src}
              alt=""
              width={plate.width}
              height={plate.height}
              loading={plate.eager ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={plate.eager ? 'high' : 'low'}
            />
            <div className="pitbull-hero-masthead__frame-scrim" />
          </Plate>
        ))}
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
  registrationFee,
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
      registrationFee={registrationFee}
      ticketsOpen={ticketsOpen}
      t={t}
      title={title}
      motion={!reducedMotion}
    />
  )

  const frame = <PitbullHeroFrame reducedMotion={reducedMotion} />

  const className =
    'pitbull-hero-masthead pitbull-hero-masthead--bleed' +
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
