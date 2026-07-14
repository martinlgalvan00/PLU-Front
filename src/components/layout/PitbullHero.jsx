import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

function PitbullHeroPanel({
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
  const { label: statusLabel } = getStatusMeta(eventStatus, t)
  const primaryLabel = t('pages.pitbull.register')
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
          <p className="pitbull-hero-masthead__status">{statusLabel}</p>
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

export default function PitbullHero({
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

  const mark = (
    <p className="pitbull-hero-masthead__mark" aria-hidden>
      PITBULL
    </p>
  )

  const panel = (
    <PitbullHeroPanel
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

  if (reducedMotion) {
    return (
      <header className="pitbull-hero-masthead pitbull-hero-masthead--text">
        <div className="pitbull-hero-masthead__shell">
          {mark}
          <div className="pitbull-hero-masthead__stripe" aria-hidden />
          <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--text">
            {panel}
          </div>
        </div>
      </header>
    )
  }

  return (
    <m.header
      className="pitbull-hero-masthead pitbull-hero-masthead--text pitbull-hero-masthead--motion"
      initial="hidden"
      animate="visible"
      variants={heroStaggerContainer}
    >
      <div className="pitbull-hero-masthead__shell">
        {mark}
        <m.div className="pitbull-hero-masthead__stripe" aria-hidden variants={heroSequenceItem} />
        <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--text">
          {panel}
        </div>
      </div>
    </m.header>
  )
}
