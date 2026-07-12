import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

function PitbullHeroPanel({
  canRegister,
  eventStatus,
  locale,
  onHome,
  onRegister,
  onSecondary,
  pitbullClassic,
  pricing,
  ticketsOpen,
  t,
  title,
}) {
  const { label: statusLabel } = getStatusMeta(eventStatus, t)
  const primaryLabel = t('pages.pitbull.register')
  const secondaryLabel = ticketsOpen ? t('pages.pitbull.heroTickets') : t('pages.pitbull.ctaCategories')

  return (
    <div className="pitbull-hero-masthead__panel">
      <nav className="pitbull-hero-masthead__breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={onHome}>
          {t('design.home')}
        </button>
        <span aria-hidden>/</span>
        <span>{t('pages.pitbull.heroBreadcrumb')}</span>
      </nav>

      <div className="pitbull-hero-masthead__dateline">
        <p className="pitbull-hero-masthead__venue-text">
          {pitbullClassic.venue}
          <span aria-hidden> · </span>
          {pitbullClassic.location}
        </p>
        <time className="pitbull-hero-masthead__date-sr" dateTime="2026-12-12/2026-12-13">
          {pitbullClassic.date}
        </time>
      </div>

      <header className="pitbull-hero-masthead__head">
        <div className="pitbull-hero-masthead__head-top">
          <span className="pitbull-hero-masthead__chapter">{t('pages.pitbull.heroEyebrow')}</span>
          <span className="pitbull-hero-masthead__status">{statusLabel}</span>
        </div>
        <h1 className="pitbull-hero-masthead__title">{title}</h1>
        <p className="pitbull-hero-masthead__lead">{t('pages.pitbull.heroLead')}</p>
        <ul className="pitbull-hero-masthead__tags" aria-label={t('pages.pitbull.categories')}>
          {pitbullClassic.categories.map((category) => (
            <li key={category}>{category}</li>
          ))}
        </ul>
      </header>

      <div className="pitbull-hero-masthead__metrics" role="group" aria-label={t('pages.pitbull.heroMetricsAria')}>
        <div
          className={`pitbull-hero-masthead__metric pitbull-hero-masthead__metric--capacity${canRegister ? ' pitbull-hero-masthead__metric--open' : ''}`}
          role="meter"
          aria-label={t('pages.pitbull.inscriptionCounterAria', {
            registered: pitbullClassic.registered,
            slots: pitbullClassic.slots,
          })}
          aria-valuemax={pitbullClassic.slots}
          aria-valuemin={0}
          aria-valuenow={pitbullClassic.registered}
        >
          <div className="pitbull-hero-masthead__capacity-head">
            <span className="pitbull-hero-masthead__metric-label">{t('pages.pitbull.heroSlots')}</span>
            <span className="pitbull-hero-masthead__capacity-value">
              {pitbullClassic.registered}
              <span className="pitbull-hero-masthead__capacity-sep">/</span>
              {pitbullClassic.slots}
            </span>
          </div>
          <div className="pitbull-hero-masthead__capacity-bar" aria-hidden>
            <div
              className="pitbull-hero-masthead__capacity-fill"
              style={{
                '--capacity-pct': `${pitbullClassic.slots > 0 ? Math.round((pitbullClassic.registered / pitbullClassic.slots) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="pitbull-hero-masthead__metric">
          <span className="pitbull-hero-masthead__metric-label">{t('pages.pitbull.heroFee')}</span>
          <strong className="pitbull-hero-masthead__metric-value">{money(pricing.registration, locale)}</strong>
        </div>
      </div>

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
          className="pitbull-hero-masthead__cta pitbull-hero-masthead__cta--secondary"
          onClick={onSecondary}
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  )
}

export default function PitbullHero({
  canRegister,
  eventStatus,
  locale,
  onHome,
  onRegister,
  onSecondary,
  pitbullClassic,
  pricing,
  ticketsOpen,
  title,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const shell = (
    <div className="pitbull-hero-masthead__shell">
      <div className="pitbull-hero-masthead__stripe" aria-hidden />
      <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--text">
        <PitbullHeroPanel
          canRegister={canRegister}
          eventStatus={eventStatus}
          locale={locale}
          onHome={onHome}
          onRegister={onRegister}
          onSecondary={onSecondary}
          pitbullClassic={pitbullClassic}
          pricing={pricing}
          ticketsOpen={ticketsOpen}
          t={t}
          title={title}
        />
      </div>
    </div>
  )

  if (reducedMotion) {
    return <header className="pitbull-hero-masthead pitbull-hero-masthead--text">{shell}</header>
  }

  return (
    <m.header
      className="pitbull-hero-masthead pitbull-hero-masthead--text pitbull-hero-masthead--motion"
      initial="hidden"
      animate="visible"
      variants={heroStaggerContainer}
    >
      <div className="pitbull-hero-masthead__shell">
        <div className="pitbull-hero-masthead__stripe" aria-hidden />
        <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--text">
          <m.div variants={heroSequenceItem}>
            <PitbullHeroPanel
              canRegister={canRegister}
              eventStatus={eventStatus}
              locale={locale}
              onHome={onHome}
              onRegister={onRegister}
              onSecondary={onSecondary}
              pitbullClassic={pitbullClassic}
              pricing={pricing}
              ticketsOpen={ticketsOpen}
              t={t}
              title={title}
            />
          </m.div>
        </div>
      </div>
    </m.header>
  )
}
